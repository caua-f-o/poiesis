/** Autocompletar ampliado:
 *  - documentação em português nas sugestões nativas (tags, atributos, propriedades, APIs JS)
 *  - classes/ids do CSS dentro de class="" e id="" no HTML, e vice-versa nos seletores CSS
 *  - caminhos de arquivos do projeto em href/src/url()/fetch()
 *  - var(--…), nomes de @keyframes, eventos, seletores em querySelector, classList, snippets */
import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
  completeFromList,
  snippetCompletion as snip,
} from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { getIndex, type Loc } from "@/lib/indexer";
import { dirName, kindOf } from "@/lib/files";
import { attrDoc, atDoc, cssPropDoc, ensureMdn, jsDoc, pseudoDoc, renderDoc, tagDoc, type DocInfo } from "./docview";
import type { PFile } from "@/lib/types";

/* ---------------- contexto ---------------- */

export type Lang = "html" | "css" | "js" | "other";

export function langAt(state: EditorState, pos: number, fallback: Lang): Lang {
  for (let n: ReturnType<ReturnType<typeof syntaxTree>["resolveInner"]> | null = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent) {
    if (n.name === "StyleSheet") return "css";
    if (n.name === "Script") return "js";
    if (n.name === "Document") return "html";
  }
  return fallback;
}

/** Arquivo atual — definido pelo editor ao trocar de aba. */
let currentFile: PFile | null = null;
export const setCompletionFile = (f: PFile | null) => (currentFile = f);

const before = (ctx: CompletionContext, n = 400) => ctx.state.sliceDoc(Math.max(0, ctx.pos - n), ctx.pos);

function relPath(target: string, fromDir: string) {
  if (!fromDir) return target;
  const a = fromDir.split("/");
  const b = target.split("/");
  while (a.length && b.length > 1 && a[0] === b[0]) a.shift(), b.shift();
  return "../".repeat(a.length) + b.join("/");
}

const firstLoc = (locs: Loc[]) => (locs[0] ? `${locs[0].file.split("/").pop()}:${locs[0].line}` : "");

/* ---------------- documentação nas sugestões nativas ---------------- */

function lookupDoc(lang: Lang, c: Completion): DocInfo | null {
  const label = c.label.replace(/^</, "").replace(/>$/, "");
  if (lang === "html") {
    if (c.type === "type") return tagDoc(label);
    if (c.type === "property") return attrDoc(label);
  }
  if (lang === "css") {
    if (c.type === "property") return cssPropDoc(label);
    if (c.type === "keyword" && label.startsWith("@")) return atDoc(label);
    if (c.type === "constant" && label.startsWith(":")) return pseudoDoc(label);
    if (c.type === "type") return tagDoc(label);
  }
  if (lang === "js") return jsDoc(label);
  return null;
}

function enrich(lang: Lang, options: readonly Completion[]): Completion[] {
  return options.map((o) => {
    // a prévia do Emmet continua disponível, mas não rouba o primeiro lugar das propriedades reais
    if (/^emmet/i.test(o.label) || o.type === "emmet") return { ...o, boost: -40 };
    if (o.info) return o;
    return {
      ...o,
      info: async () => {
        let d = lookupDoc(lang, o);
        if (!d && lang !== "js") {
          await ensureMdn();
          d = lookupDoc(lang, o);
        }
        return d ? renderDoc(d, { compact: true }) : null;
      },
    };
  });
}

function languageSources(ctx: CompletionContext): CompletionSource[] {
  return ctx.state
    .languageDataAt<CompletionSource | readonly (string | Completion)[]>("autocomplete", ctx.pos)
    .map((s) => (typeof s === "function" ? s : completeFromList(s)));
}

/** Embrulha a i-ésima fonte de autocompletar da linguagem no cursor, enriquecendo com docs. */
function wrapped(i: number, fallback: () => Lang): CompletionSource {
  return async (ctx) => {
    const src = languageSources(ctx)[i];
    if (!src) return null;
    const r = (await src(ctx)) as CompletionResult | null;
    if (!r) return r;
    const lang = langAt(ctx.state, ctx.pos, fallback());
    // No CSS o item "Emmet abbreviation" (sem filtro) ficaria sempre no topo, escondendo as propriedades.
    // A expansão continua no Tab; só a sugestão é omitida.
    if (lang === "css" && r.filter === false && r.options.some((o) => o.type === "emmet")) return null;
    return { ...r, options: enrich(lang, r.options) };
  };
}

/* ---------------- HTML ---------------- */

function classOptions(withDot: boolean): Completion[] {
  const ix = getIndex();
  const out: Completion[] = [];
  for (const [name, e] of ix.classes) {
    const defined = e.defs.length > 0;
    out.push({
      label: (withDot ? "." : "") + name,
      type: "class",
      detail: defined ? firstLoc(e.defs) : `usada em ${firstLoc(e.uses)}`,
      boost: defined ? 2 : 0,
      info: () =>
        renderDoc(
          { title: "." + name, kind: defined ? "Classe do projeto" : "Classe sem estilo", desc: defined ? "" : "Ainda não há regra CSS para esta classe." },
          { compact: true, sections: [{ title: "Estilos", items: e.defs }, { title: "Usos", items: e.uses }] }
        ),
    });
  }
  return out;
}

function idOptions(withHash: boolean, source: "html" | "css" | "any"): Completion[] {
  const ix = getIndex();
  const out: Completion[] = [];
  for (const [name, e] of ix.ids) {
    const inHtml = e.defs.length > 0;
    if (source === "css" && !inHtml) continue;
    out.push({
      label: (withHash ? "#" : "") + name,
      type: "variable",
      detail: inHtml ? `<${e.defs[0].extra ?? "?"}> ${firstLoc(e.defs)}` : `estilizado em ${firstLoc(e.styles)}`,
      boost: inHtml ? 2 : 1,
      info: () =>
        renderDoc(
          { title: "#" + name, kind: "ID do projeto", desc: "" },
          { compact: true, sections: [{ title: "Elemento", items: e.defs }, { title: "Estilos", items: e.styles }, { title: "No JavaScript", items: e.uses }] }
        ),
    });
  }
  return out;
}

function pathOptions(accept: (f: PFile) => boolean): Completion[] {
  const ix = getIndex();
  const dir = currentFile ? dirName(currentFile.name) : "";
  return ix.files
    .filter((f) => f.id !== currentFile?.id && accept(f))
    .map((f) => ({ label: relPath(f.name, dir), type: "text", detail: f.kind === "asset" ? "mídia" : f.kind.toUpperCase(), boost: f.name.includes("/") ? 0 : 1 }));
}

const isImg = (f: PFile) => f.kind === "asset" ? /^image\//.test(f.mime || "") : /\.svg$/i.test(f.name);

const htmlExtras: CompletionSource = (ctx) => {
  const txt = before(ctx);
  // class="a b|"
  let m = /\sclass\s*=\s*(["'])([^"']*)$/.exec(txt);
  if (m) {
    const word = /[^\s]*$/.exec(m[2])![0];
    return { from: ctx.pos - word.length, options: classOptions(false), validFor: /^[\w-]*$/ };
  }
  m = /\sid\s*=\s*(["'])([^"']*)$/.exec(txt);
  if (m) {
    // ids estilizados no CSS ou usados no JS mas ainda sem elemento
    const ix = getIndex();
    const opts: Completion[] = [];
    for (const [name, e] of ix.ids)
      if (!e.defs.length) opts.push({ label: name, type: "variable", detail: e.styles.length ? `estilizado em ${firstLoc(e.styles)}` : `usado em ${firstLoc(e.uses)}`, boost: 2 });
    return { from: ctx.pos - m[2].length, options: opts, validFor: /^[\w-]*$/ };
  }
  m = /\sfor\s*=\s*(["'])([\w-]*)$/.exec(txt);
  if (m) return { from: ctx.pos - m[2].length, options: idOptions(false, "any").filter((o) => !String(o.detail).startsWith("estilizado")), validFor: /^[\w-]*$/ };

  m = /\s(href|src|poster|data|action)\s*=\s*(["'])([^"']*)$/.exec(txt);
  if (m) {
    const tag = (/<([a-zA-Z][\w-]*)[^<>]*$/.exec(txt)?.[1] ?? "").toLowerCase();
    const attr = m[1];
    const value = m[3];
    let accept: (f: PFile) => boolean = () => true;
    if (tag === "link") accept = (f) => f.kind === "css" || isImg(f) || f.kind === "json";
    else if (tag === "script") accept = (f) => f.kind === "js";
    else if (tag === "img" || tag === "source" || attr === "poster") accept = (f) => isImg(f) || f.kind === "asset";
    else if (tag === "video" || tag === "audio") accept = (f) => f.kind === "asset";
    else if (tag === "a" || tag === "iframe" || tag === "form") accept = (f) => f.kind === "html" || f.kind === "asset" || f.kind === "text";
    const opts = pathOptions(accept);
    if (tag === "a" && value.startsWith("#")) {
      return { from: ctx.pos - value.length + 1, options: idOptions(false, "html").filter((o) => !String(o.detail).startsWith("estilizado")), validFor: /^[\w-]*$/ };
    }
    if (tag === "a") opts.push({ label: "#", type: "keyword", detail: "âncora para um id da página" }, { label: "mailto:", type: "keyword" }, { label: "tel:", type: "keyword" });
    return { from: ctx.pos - value.length, options: opts, validFor: /^[^"'\s]*$/ };
  }
  return null;
};

/* ---------------- CSS ---------------- */

function cssInBlock(state: EditorState, pos: number) {
  for (let n: ReturnType<ReturnType<typeof syntaxTree>["resolveInner"]> | null = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent) {
    if (n.name === "Block") return n.parent?.name === "RuleSet" || n.parent?.name === "KeyframeList" ? true : false;
    if (n.name === "StyleSheet") return false;
  }
  return false;
}

const FONT_STACKS = [
  "system-ui, sans-serif",
  "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif",
  "Georgia, \"Times New Roman\", serif",
  "ui-monospace, \"Cascadia Code\", Consolas, monospace",
  "\"Helvetica Neue\", Arial, sans-serif",
];

const cssExtras: CompletionSource = (ctx) => {
  const txt = before(ctx);
  let m = /var\(\s*(--[\w-]*)?$/.exec(txt);
  if (m) {
    const ix = getIndex();
    const word = m[1] ?? "";
    const opts: Completion[] = [...ix.vars].filter(([, e]) => e.defs.length).map(([name, e]) => ({
      label: name,
      type: "variable",
      detail: e.defs[0].extra,
      info: () => renderDoc({ title: name, kind: "Variável CSS do projeto", desc: `Valor: ${e.defs[0].extra ?? "—"}` }, { compact: true, sections: [{ title: "Definida em", items: e.defs }, { title: "Usos", items: e.uses }] }),
    }));
    return { from: ctx.pos - word.length, options: opts, validFor: /^[\w-]*$/ };
  }
  m = /url\(\s*(["']?)([^"')]*)$/.exec(txt);
  if (m) return { from: ctx.pos - m[2].length, options: pathOptions((f) => f.kind === "asset" || isImg(f) || f.kind === "css"), validFor: /^[^"')\s]*$/ };
  m = /animation(?:-name)?\s*:\s*(?:[^;{}]*\s)?([\w-]*)$/.exec(txt);
  if (m && cssInBlock(ctx.state, ctx.pos)) {
    const ix = getIndex();
    const opts = [...ix.keyframes].filter(([, e]) => e.defs.length).map(([name, e]) => ({ label: name, type: "function", detail: `@keyframes · ${firstLoc(e.defs)}`, boost: 3 }));
    if (opts.length) return { from: ctx.pos - m[1].length, options: opts, validFor: /^[\w-]*$/ };
  }
  m = /font-family\s*:\s*$/.exec(txt);
  if (m) return { from: ctx.pos, options: FONT_STACKS.map((f) => ({ label: f, type: "constant", detail: "pilha de fontes" })) };

  const inBlock = cssInBlock(ctx.state, ctx.pos);
  if (!inBlock) {
    // seletores: .classe e #id vindos do HTML/JS
    const w = ctx.matchBefore(/[.#][\w-]*$/);
    if (w) {
      const isClass = w.text.startsWith(".");
      return { from: w.from, options: isClass ? classOptions(true) : idOptions(true, "any"), validFor: /^[.#][\w-]*$/ };
    }
  } else {
    // redefinir uma variável existente: --cor
    const w = ctx.matchBefore(/(^|[;{\s])--[\w-]*$/);
    if (w) {
      const word = /--[\w-]*$/.exec(w.text)![0];
      const ix = getIndex();
      return { from: ctx.pos - word.length, options: [...ix.vars.keys()].map((n) => ({ label: n, type: "variable", apply: n + ": " })), validFor: /^--[\w-]*$/ };
    }
  }
  return null;
};

/* ---------------- JavaScript ---------------- */

const EVENTS = "click dblclick input change submit reset keydown keyup focus blur load DOMContentLoaded scroll resize mouseenter mouseleave mousemove mousedown mouseup pointerdown pointermove pointerup pointerenter pointerleave wheel contextmenu touchstart touchmove touchend animationend transitionend dragstart dragover drop copy paste visibilitychange beforeunload hashchange popstate message error".split(" ");

const JS_SNIPPETS: Completion[] = [
  snip("console.log(${});", { label: "log", detail: "console.log()", type: "function" }),
  snip("document.querySelector('${seletor}')", { label: "qs", detail: "querySelector", type: "function" }),
  snip("document.querySelectorAll('${seletor}')", { label: "qsa", detail: "querySelectorAll", type: "function" }),
  snip("${el}.addEventListener('${click}', (evento) => {\n\t${}\n});", { label: "ael", detail: "addEventListener", type: "function" }),
  snip("function ${nome}(${parametros}) {\n\t${}\n}", { label: "fn", detail: "função", type: "keyword" }),
  snip("const ${nome} = (${parametros}) => {\n\t${}\n};", { label: "arrow", detail: "arrow function", type: "keyword" }),
  snip("async function ${nome}() {\n\tconst resposta = await fetch('${url}');\n\tconst dados = await resposta.json();\n\t${}\n}", { label: "fetchjson", detail: "fetch + JSON", type: "keyword" }),
  snip("for (const ${item} of ${lista}) {\n\t${}\n}", { label: "forof", detail: "for…of", type: "keyword" }),
  snip("for (let ${i} = 0; ${i} < ${lista}.length; ${i}++) {\n\t${}\n}", { label: "fori", detail: "for clássico", type: "keyword" }),
  snip("setTimeout(() => {\n\t${}\n}, ${1000});", { label: "timeout", detail: "setTimeout", type: "function" }),
  snip("function ${quadro}(tempo) {\n\t${}\n\trequestAnimationFrame(${quadro});\n}\nrequestAnimationFrame(${quadro});", { label: "raf", detail: "loop de animação", type: "keyword" }),
  snip("localStorage.setItem('${chave}', JSON.stringify(${valor}));", { label: "lsset", detail: "salvar no localStorage", type: "function" }),
  snip("JSON.parse(localStorage.getItem('${chave}') ?? '${null}')", { label: "lsget", detail: "ler do localStorage", type: "function" }),
  snip("try {\n\t${}\n} catch (erro) {\n\tconsole.error(erro);\n}", { label: "trycatch", detail: "try/catch", type: "keyword" }),
  snip("const ${el} = document.createElement('${div}');\n${el}.className = '${classe}';\n${pai}.append(${el});", { label: "create", detail: "criar e anexar elemento", type: "function" }),
  snip("class ${Nome} {\n\tconstructor(${}) {\n\t\t${}\n\t}\n}", { label: "classe", detail: "class", type: "keyword" }),
];

function inJsString(state: EditorState, pos: number) {
  const n = syntaxTree(state).resolveInner(pos, -1);
  return n.name === "String" || n.name === "TemplateString" || n.name === "LineComment" || n.name === "BlockComment";
}

const jsExtras: CompletionSource = (ctx) => {
  const txt = before(ctx);
  let m = /\b(querySelector(?:All)?|closest|matches)\(\s*(["'`])([^"'`]*)$/.exec(txt);
  if (m) {
    const w = /[.#]?[\w-]*$/.exec(m[3])![0];
    const opts = w.startsWith("#") ? idOptions(true, "any") : w.startsWith(".") ? classOptions(true) : [...classOptions(true), ...idOptions(true, "any")];
    return { from: ctx.pos - w.length, options: opts, validFor: /^[.#]?[\w-]*$/ };
  }
  m = /\bgetElementById\(\s*(["'`])([\w-]*)$/.exec(txt);
  if (m) return { from: ctx.pos - m[2].length, options: idOptions(false, "html"), validFor: /^[\w-]*$/ };
  m = /\bclassList\.(?:add|remove|toggle|contains|replace)\((?:[^)]*,\s*)?(["'`])([\w-]*)$/.exec(txt);
  if (m) return { from: ctx.pos - m[2].length, options: classOptions(false), validFor: /^[\w-]*$/ };
  m = /\b(?:add|remove)EventListener\(\s*(["'`])(\w*)$/.exec(txt);
  if (m) return { from: ctx.pos - m[2].length, options: EVENTS.map((e) => ({ label: e, type: "constant", detail: "evento" })), validFor: /^\w*$/ };
  m = /\b(?:fetch|import)\(\s*(["'`])([^"'`]*)$/.exec(txt) ?? /\bfrom\s+(["'])([^"']*)$/.exec(txt);
  if (m) {
    const isImport = /import|from/.test(txt.slice(m.index, m.index + 8));
    const opts = pathOptions((f) => (isImport ? f.kind === "js" : f.kind !== "asset" || true)).map((o) => (isImport && !o.label.startsWith(".") ? { ...o, label: "./" + o.label } : o));
    return { from: ctx.pos - m[2].length, options: opts, validFor: /^[^"'`\s]*$/ };
  }
  if (inJsString(ctx.state, ctx.pos)) return null;
  const w = ctx.matchBefore(/[\w$]+$/);
  if (!w && !ctx.explicit) return null;
  // funções/classes declaradas em outros arquivos do projeto
  const ix = getIndex();
  const opts: Completion[] = [...JS_SNIPPETS];
  for (const [name, e] of ix.functions) {
    const other = e.defs.find((d) => d.fileId !== currentFile?.id);
    if (!other) continue;
    opts.push({
      label: name,
      type: other.extra === "class" ? "class" : "function",
      detail: firstLoc([other]),
      info: () => renderDoc({ title: name, kind: other.extra === "class" ? "Classe do projeto" : "Função do projeto", desc: "" }, { compact: true, sections: [{ title: "Declaração", items: e.defs }] }),
    });
  }
  return { from: w ? w.from : ctx.pos, options: opts, validFor: /^[\w$]*$/ };
};

/* ---------------- montagem ---------------- */

export function completionSources(fileKind: () => Lang): CompletionSource[] {
  const dispatch =
    (fn: Record<Lang, CompletionSource | null>): CompletionSource =>
    (ctx) => {
      const l = langAt(ctx.state, ctx.pos, fileKind());
      const s = fn[l];
      return s ? s(ctx) : null;
    };
  return [
    wrapped(0, fileKind),
    wrapped(1, fileKind),
    wrapped(2, fileKind),
    wrapped(3, fileKind),
    dispatch({ html: htmlExtras, css: cssExtras, js: jsExtras, other: null }),
  ];
}

export const langOfKind = (kind: string, name: string): Lang =>
  kind === "html" || /\.svg$/i.test(name) ? "html" : kind === "css" ? "css" : kind === "js" || kind === "json" ? "js" : kindOf(name) === "html" ? "html" : "other";
