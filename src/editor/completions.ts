// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/** Autocompletar ampliado:
 *  - documentação em português nas sugestões nativas (tags, atributos, propriedades, APIs JS)
 *  - classes/ids do CSS dentro de class="" e id="" no HTML, e vice-versa nos seletores CSS
 *  - caminhos de arquivos do projeto em href/src/url()/fetch()
 *  - var(--…), nomes de @keyframes, eventos, seletores em querySelector, classList, snippets
 *  - tags já preenchidas com arquivos (<img src>, <link href>, <script src>…), style="", data-*,
 *    nomes de ícones Material Symbols, chaves do localStorage, fontes do projeto */
import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
  completeFromList,
  completionStatus,
  snippetCompletion as snip,
} from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import { Transaction } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { getIndex, type Loc } from "@/lib/indexer";
import { dirName, kindOf } from "@/lib/files";
import { attrDoc, atDoc, cssPropDoc, ensureMdn, jsDoc, pseudoDoc, renderDoc, tagDoc, type DocInfo } from "./docview";
import { CSS_PROPS, HTML_TAGS, mdnNow } from "@/lib/docs";
import { POPULAR, PREVIEW_FAMILY, ensurePreviewFonts, loadSymbolNames, type SymbolStyle } from "@/lib/symbols";
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
    // dentro do nome de um ícone ou de style="" quem responde são as fontes próprias do Poiesis
    const b = before(ctx, 300);
    if (ICON_SPAN.test(b) || /\sstyle\s*=\s*["'][^"']*$/.test(b)) return null;
    const r = (await src(ctx)) as CompletionResult | null;
    if (!r) return r;
    const lang = langAt(ctx.state, ctx.pos, fallback());
    // No CSS o item "Emmet abbreviation" (sem filtro) ficaria sempre no topo, escondendo as propriedades.
    // A expansão continua no Tab; só a sugestão é omitida.
    if (lang === "css" && r.filter === false && r.options.some((o) => o.type === "emmet")) return null;
    return { ...r, options: enrich(lang, r.options) };
  };
}

const ICON_SPAN = /<[a-zA-Z][\w-]*\b[^<>]*class\s*=\s*["'][^"']*material-symbols-(outlined|rounded|sharp)[^"']*["'][^<>]*>([\w]*)$/;

/* ---------------- seções ---------------- */

const SEC = {
  files: { name: "Arquivos do projeto", rank: 1 },
  project: { name: "Do projeto", rank: 2 },
  icons: { name: "Material Symbols", rank: 1 },
  suggest: { name: "Sugestões", rank: 3 },
  snippets: { name: "Snippets", rank: 4 },
};

/* ---------------- arquivos ---------------- */

const isImg = (f: PFile) => (f.kind === "asset" ? /^image\//.test(f.mime || "") : /\.svg$/i.test(f.name));
const isMedia = (f: PFile, kind: "video" | "audio") => f.kind === "asset" && (f.mime || "").startsWith(kind + "/");
const isModule = (f: PFile) => /(^|[\n;])\s*(import\s*[\w*{"'$]|export\s)/.test(f.content);

function filePreview(f: PFile): HTMLElement {
  const root = document.createElement("div");
  root.className = "pz-doc compact";
  const head = document.createElement("div");
  head.className = "pz-doc-head";
  const t = document.createElement("code");
  t.className = "pz-doc-title";
  t.textContent = f.name;
  const k = document.createElement("span");
  k.className = "pz-doc-kind";
  k.textContent = f.kind === "asset" ? f.mime || "arquivo" : f.kind.toUpperCase();
  head.append(t, k);
  root.append(head);
  if (isImg(f)) {
    const img = document.createElement("img");
    img.src = f.kind === "asset" ? f.content : "data:image/svg+xml;charset=utf-8," + encodeURIComponent(f.content);
    img.style.cssText = "display:block;max-width:220px;max-height:160px;border-radius:8px;margin-top:4px;background:repeating-conic-gradient(#8883 0 25%,transparent 0 50%) 50%/12px 12px";
    img.onload = () => {
      const d = document.createElement("div");
      d.className = "pz-doc-muted";
      d.style.marginTop = "6px";
      d.textContent = `${img.naturalWidth} × ${img.naturalHeight}`;
      root.append(d);
    };
    root.append(img);
  } else if (f.kind !== "asset") {
    const pre = document.createElement("pre");
    pre.className = "pz-doc-ex";
    pre.textContent = f.content.split("\n").slice(0, 8).join("\n") || "(vazio)";
    root.append(pre);
  }
  return root;
}

function pathOptions(accept: (f: PFile) => boolean, opts: { prefixDot?: boolean } = {}): Completion[] {
  const ix = getIndex();
  const dir = currentFile ? dirName(currentFile.name) : "";
  return ix.files
    .filter((f) => f.id !== currentFile?.id && accept(f))
    .map((f) => {
      let label = relPath(f.name, dir);
      if (opts.prefixDot && !label.startsWith(".")) label = "./" + label;
      return {
        label,
        type: "text",
        detail: f.kind === "asset" ? (f.mime || "mídia").split("/")[0] : f.kind.toUpperCase(),
        section: SEC.files,
        boost: f.name.includes("/") ? 0 : 1,
        info: () => filePreview(f),
      };
    });
}

/* ---------------- classes e ids ---------------- */

const SYMBOL_CLASSES = ["material-symbols-outlined", "material-symbols-rounded", "material-symbols-sharp"];

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
      section: SEC.project,
      info: () =>
        renderDoc(
          { title: "." + name, kind: defined ? "Classe do projeto" : "Classe sem estilo", desc: defined ? "" : "Ainda não há regra CSS para esta classe." },
          { compact: true, sections: [{ title: "Estilos", items: e.defs }, { title: "Usos", items: e.uses }] }
        ),
    });
  }
  if (!withDot)
    for (const c of SYMBOL_CLASSES)
      if (!ix.classes.has(c))
        out.push({ label: c, type: "class", detail: "ícones Google", section: SEC.suggest, boost: -2, info: () => renderDoc({ title: c, kind: "Material Symbols", desc: "Classe da fonte de ícones do Google. O nome do ícone vai como texto do elemento: <span class=\"" + c + "\">home</span>. Precisa do <link> da fonte no <head> — o seletor de ícones (Alt+I) adiciona sozinho." }, { compact: true }) });
  return out;
}

function idOptions(withHash: boolean, source: "html" | "css" | "any"): Completion[] {
  const ix = getIndex();
  const out: Completion[] = [];
  for (const [name, e] of ix.ids) {
    const inHtml = e.defs.length > 0;
    if (source === "html" && !inHtml) continue;
    out.push({
      label: (withHash ? "#" : "") + name,
      type: "variable",
      detail: inHtml ? `<${e.defs[0].extra ?? "?"}> ${firstLoc(e.defs)}` : `estilizado em ${firstLoc(e.styles)}`,
      boost: inHtml ? 2 : 1,
      section: SEC.project,
      info: () =>
        renderDoc(
          { title: "#" + name, kind: "ID do projeto", desc: "" },
          { compact: true, sections: [{ title: "Elemento", items: e.defs }, { title: "Estilos", items: e.styles }, { title: "No JavaScript", items: e.uses }] }
        ),
    });
  }
  return out;
}

const tagNames = () => {
  const used = getIndex().tags;
  return Object.keys(HTML_TAGS)
    .filter((t) => !t.startsWith("!"))
    .map((t) => ({ label: t, type: "type", detail: HTML_TAGS[t].c === "doc" ? "estrutura" : undefined, boost: used.has(t) ? 1 : 0, info: () => renderDoc(tagDoc(t), { compact: true }) }));
};

/* ---------------- ícones Material Symbols ---------------- */

async function iconOptions(style: string): Promise<Completion[]> {
  const names = await loadSymbolNames();
  ensurePreviewFonts();
  const fam = PREVIEW_FAMILY[(style as SymbolStyle) || "rounded"] ?? PREVIEW_FAMILY.rounded;
  const popular = new Set(POPULAR);
  return names.map((n) => ({
    label: n,
    type: "constant",
    section: SEC.icons,
    boost: popular.has(n) ? 2 : 0,
    info: () => {
      const d = document.createElement("div");
      d.className = "pz-doc compact";
      d.style.cssText = "display:flex;align-items:center;gap:14px;min-width:0";
      const g = document.createElement("span");
      g.textContent = n;
      g.style.cssText = `font-family:"${fam}";font-size:44px;line-height:1;font-feature-settings:"liga";color:var(--md-primary)`;
      const t = document.createElement("code");
      t.className = "pz-doc-title";
      t.textContent = n;
      d.append(g, t);
      return d;
    },
  }));
}

/* ---------------- HTML ---------------- */

const ATTR_VALUES: Record<string, string[]> = {
  "link.rel": ["icon", "preconnect", "preload", "modulepreload", "manifest", "apple-touch-icon", "dns-prefetch"],
  "a.target": ["_blank", "_self", "_parent", "_top"],
  "form.target": ["_blank", "_self"],
  "*.loading": ["lazy", "eager"],
  "img.decoding": ["async", "sync", "auto"],
  "script.type": ["module", "importmap", "text/javascript"],
  "*.lang": ["pt-BR", "pt-PT", "en", "es", "fr", "ja"],
  "meta.name": ["viewport", "description", "theme-color", "author", "keywords", "robots", "color-scheme"],
  "meta.charset": ["UTF-8"],
  "html.lang": ["pt-BR"],
  "button.type": ["button", "submit", "reset"],
  "*.dir": ["ltr", "rtl", "auto"],
  "*.autocomplete": ["off", "on", "name", "email", "username", "current-password", "new-password", "tel", "street-address", "postal-code"],
  "*.inputmode": ["text", "numeric", "decimal", "tel", "email", "url", "search"],
  "*.role": ["button", "navigation", "main", "dialog", "alert", "banner", "contentinfo", "list", "listitem", "tab", "tabpanel", "img", "presentation"],
};

const META_CONTENT: Record<string, string[]> = {
  viewport: ["width=device-width, initial-scale=1.0"],
  robots: ["index, follow", "noindex, nofollow"],
  "color-scheme": ["light dark", "dark", "light"],
};

/** Ao digitar o nome da tag: <img, <link, <script… já com um arquivo do projeto preenchido. */
function tagFileOptions(typed: string): Completion[] {
  const ix = getIndex();
  const dir = currentFile ? dirName(currentFile.name) : "";
  const out: Completion[] = [];
  const add = (tag: string, f: PFile, template: string, detail: string) => {
    if (typed && !tag.startsWith(typed.toLowerCase())) return;
    const p = relPath(f.name, dir).replace(/[$}\\]/g, "\\$&");
    out.push(
      snip(template.replace(/@P/g, p), {
        label: `${tag} ${f.name.split("/").pop()}`,
        displayLabel: `${tag} → ${relPath(f.name, dir)}`,
        detail,
        type: "type",
        section: SEC.files,
        boost: 3,
        info: () => filePreview(f),
      })
    );
  };
  for (const f of ix.files) {
    if (f.id === currentFile?.id) continue;
    const base = (f.name.split("/").pop() || "").replace(/\.[^.]+$/, "");
    if (isImg(f)) {
      add("img", f, `img src="@P" alt="\${${base}}">`, "imagem");
      add("link", f, `link rel="icon" href="@P">`, "favicon");
      add("source", f, `source srcset="@P" type="${f.mime || "image/png"}">`, "fonte de <picture>");
    }
    if (f.kind === "css") add("link", f, `link rel="stylesheet" href="@P">`, "folha de estilo");
    if (f.kind === "js") add("script", f, isModule(f) ? `script type="module" src="@P"></script>` : `script src="@P" defer></script>`, isModule(f) ? "módulo ES" : "script");
    if (f.kind === "html") {
      add("a", f, `a href="@P">\${${base}}</a>`, "link para página");
      add("iframe", f, `iframe src="@P" title="\${${base}}"></iframe>`, "página embutida");
    }
    if (isMedia(f, "video")) add("video", f, `video src="@P" controls></video>`, "vídeo");
    if (isMedia(f, "audio")) add("audio", f, `audio src="@P" controls></audio>`, "áudio");
    if (f.kind === "json" && /manifest/i.test(f.name)) add("link", f, `link rel="manifest" href="@P">`, "manifesto");
  }
  // ícones prontos para escolher
  for (const style of ["rounded", "outlined", "sharp"]) {
    if ("span".startsWith(typed.toLowerCase()) || "icone".startsWith(typed.toLowerCase())) {
      out.push(
        snip(`span class="material-symbols-${style}">\${icone}</span>`, {
          label: `span ícone ${style}`,
          displayLabel: `span → ícone Material Symbols (${style})`,
          type: "type",
          section: SEC.icons,
          detail: "Alt+I abre o seletor",
        })
      );
    }
  }
  return out.slice(0, 80);
}

function cssPropNames(): Completion[] {
  const mdn = mdnNow();
  const names = new Set([...Object.keys(CSS_PROPS), ...(mdn ? Object.keys(mdn.css) : [])]);
  return [...names].map((n) => ({
    label: n,
    type: "property",
    boost: CSS_PROPS[n] ? 1 : 0,
    apply: n + ": ",
    info: () => {
      const d = cssPropDoc(n);
      return d ? renderDoc(d, { compact: true }) : null;
    },
  }));
}

function cssValueOptions(prop: string): Completion[] {
  const mdn = mdnNow();
  const vals = new Set<string>([...(mdn?.css[prop]?.[2] ?? []), "inherit", "initial", "unset"]);
  const out: Completion[] = [...vals].map((v) => ({ label: v, type: "keyword" }));
  for (const [name, e] of getIndex().vars) if (e.defs.length) out.push({ label: `var(${name})`, type: "variable", detail: e.defs[0].extra, section: SEC.project });
  if (/color|background|fill|stroke|border/.test(prop)) out.push(...["transparent", "currentColor", "#000000", "#ffffff", "rgb()", "hsl()", "oklch()"].map((v) => ({ label: v, type: "constant" })));
  return out;
}

const htmlExtras: CompletionSource = async (ctx) => {
  const txt = before(ctx);

  // <span class="material-symbols-xxx">nome|
  let m = ICON_SPAN.exec(txt);
  if (m) return { from: ctx.pos - m[2].length, options: await iconOptions(m[1]), validFor: /^\w*$/ };

  // <tag (nome da tag)
  m = /<([a-zA-Z][\w-]*)?$/.exec(txt);
  if (m && (m[1] || ctx.explicit)) {
    const opts = tagFileOptions(m[1] ?? "");
    return opts.length ? { from: ctx.pos - (m[1]?.length ?? 0), options: opts, validFor: /^[\w-]*$/ } : null;
  }

  // class="a b|"
  m = /\sclass\s*=\s*(["'])([^"']*)$/.exec(txt);
  if (m) {
    const word = /[^\s]*$/.exec(m[2])![0];
    return { from: ctx.pos - word.length, options: classOptions(false), validFor: /^[\w-]*$/ };
  }
  m = /\sid\s*=\s*(["'])([^"']*)$/.exec(txt);
  if (m) {
    const ix = getIndex();
    const opts: Completion[] = [];
    for (const [name, e] of ix.ids)
      if (!e.defs.length) opts.push({ label: name, type: "variable", section: SEC.project, detail: e.styles.length ? `estilizado em ${firstLoc(e.styles)}` : `usado em ${firstLoc(e.uses)}`, boost: 2 });
    return { from: ctx.pos - m[2].length, options: opts, validFor: /^[\w-]*$/ };
  }
  m = /\s(?:for|aria-labelledby|aria-describedby|aria-controls|list|form)\s*=\s*(["'])([\w-]*)$/.exec(txt);
  if (m) return { from: ctx.pos - m[2].length, options: idOptions(false, "html"), validFor: /^[\w-]*$/ };

  // style="cor: …"
  m = /\sstyle\s*=\s*(["'])([^"']*)$/.exec(txt);
  if (m) {
    await ensureMdn();
    const decl = m[2].split(";").pop()!;
    const colon = decl.indexOf(":");
    if (colon === -1) {
      const word = decl.trimStart();
      return { from: ctx.pos - word.length, options: cssPropNames(), validFor: /^[\w-]*$/ };
    }
    const prop = decl.slice(0, colon).trim().toLowerCase();
    const word = /[^\s,()]*$/.exec(decl.slice(colon + 1))![0];
    return { from: ctx.pos - word.length, options: cssValueOptions(prop), validFor: /^[^\s;,()]*$/ };
  }

  // caminhos em href/src/…
  m = /\s(href|src|poster|data|action|srcset)\s*=\s*(["'])([^"']*)$/.exec(txt);
  if (m) {
    const tag = (/<([a-zA-Z][\w-]*)[^<>]*$/.exec(txt)?.[1] ?? "").toLowerCase();
    const attr = m[1];
    const value = attr === "srcset" ? (/[^,\s]*$/.exec(m[3])?.[0] ?? "") : m[3];
    const rel = /\srel\s*=\s*["']([^"']*)["']/.exec(/<[a-zA-Z][^<>]*$/.exec(txt)?.[0] ?? "")?.[1]?.toLowerCase() ?? "";
    let accept: (f: PFile) => boolean = () => true;
    if (tag === "link") accept = rel.includes("stylesheet") ? (f) => f.kind === "css" : rel.includes("icon") ? isImg : rel === "manifest" ? (f) => f.kind === "json" : (f) => f.kind === "css" || isImg(f) || f.kind === "json";
    else if (tag === "script") accept = (f) => f.kind === "js";
    else if (tag === "img" || tag === "source" || attr === "poster" || attr === "srcset") accept = isImg;
    else if (tag === "video") accept = (f) => isMedia(f, "video");
    else if (tag === "audio") accept = (f) => isMedia(f, "audio");
    else if (tag === "a" || tag === "iframe" || tag === "form") accept = (f) => f.kind === "html" || f.kind === "asset" || f.kind === "text" || f.kind === "json";
    if (tag === "a" && value.startsWith("#")) return { from: ctx.pos - value.length + 1, options: idOptions(false, "html"), validFor: /^[\w-]*$/ };
    const opts = pathOptions(accept);
    if (tag === "a")
      opts.push(
        { label: "#", type: "keyword", detail: "âncora para um id", section: SEC.suggest },
        { label: "mailto:", type: "keyword", section: SEC.suggest },
        { label: "tel:", type: "keyword", section: SEC.suggest },
        { label: "https://", type: "keyword", section: SEC.suggest }
      );
    if (tag === "link" && rel.includes("stylesheet"))
      opts.push({ label: "https://fonts.googleapis.com/css2?family=", type: "keyword", detail: "Google Fonts", section: SEC.suggest });
    return { from: ctx.pos - value.length, options: opts, validFor: /^[^"'\s,]*$/ };
  }

  // content="…" de <meta name="…">
  m = /\scontent\s*=\s*(["'])([^"']*)$/.exec(txt);
  if (m) {
    const name = /\sname\s*=\s*["']([^"']+)["']/.exec(/<meta[^<>]*$/i.exec(txt)?.[0] ?? "")?.[1]?.toLowerCase();
    const vals = name ? META_CONTENT[name] : null;
    if (vals) return { from: ctx.pos - m[2].length, options: vals.map((v) => ({ label: v, type: "constant", section: SEC.suggest })) };
  }

  // valores sugeridos de atributos
  m = /\s([\w-]+)\s*=\s*(["'])([^"']*)$/.exec(txt);
  if (m) {
    const tag = (/<([a-zA-Z][\w-]*)[^<>]*$/.exec(txt)?.[1] ?? "").toLowerCase();
    const vals = ATTR_VALUES[`${tag}.${m[1]}`] ?? ATTR_VALUES[`*.${m[1]}`];
    if (vals) return { from: ctx.pos - m[3].length, options: vals.map((v) => ({ label: v, type: "constant", section: SEC.suggest })), validFor: /^[^"'\s]*$/ };
  }

  // nome de atributo data-* já usado no projeto
  const w = ctx.matchBefore(/\sdata-[\w-]*$/);
  if (w && /<[a-zA-Z][^<>]*$/.test(txt)) {
    const word = w.text.trimStart();
    const opts = [...getIndex().dataAttrs.keys()].map((k) => ({ label: "data-" + k, type: "property", section: SEC.project, apply: `data-${k}=""` }));
    return opts.length ? { from: ctx.pos - word.length, options: opts, validFor: /^[\w-]*$/ } : null;
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
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  'Georgia, "Times New Roman", serif',
  'ui-monospace, "Cascadia Code", Consolas, monospace',
  '"Helvetica Neue", Arial, sans-serif',
];
const GENERIC_FONTS = ["sans-serif", "serif", "monospace", "system-ui", "cursive", "fantasy", "ui-rounded"];

const cssExtras: CompletionSource = async (ctx) => {
  const txt = before(ctx);
  let m = /var\(\s*(--[\w-]*)?$/.exec(txt);
  if (m) {
    const ix = getIndex();
    const word = m[1] ?? "";
    const opts: Completion[] = [...ix.vars]
      .filter(([, e]) => e.defs.length)
      .map(([name, e]) => ({
        label: name,
        type: "variable",
        detail: e.defs[0].extra,
        section: SEC.project,
        info: () => renderDoc({ title: name, kind: "Variável CSS do projeto", desc: `Valor: ${e.defs[0].extra ?? "—"}` }, { compact: true, sections: [{ title: "Definida em", items: e.defs }, { title: "Usos", items: e.uses }] }),
      }));
    return { from: ctx.pos - word.length, options: opts, validFor: /^[\w-]*$/ };
  }
  m = /url\(\s*(["']?)([^"')]*)$/.exec(txt) ?? /@import\s+(["'])([^"']*)$/.exec(txt);
  if (m) {
    const isImport = /@import/.test(txt.slice(m.index, m.index + 8));
    return { from: ctx.pos - m[2].length, options: pathOptions(isImport ? (f) => f.kind === "css" : (f) => f.kind === "asset" || isImg(f) || f.kind === "css"), validFor: /^[^"')\s]*$/ };
  }
  m = /animation(?:-name)?\s*:\s*(?:[^;{}]*[\s,])?([\w-]*)$/.exec(txt);
  if (m && cssInBlock(ctx.state, ctx.pos)) {
    const ix = getIndex();
    const opts = [...ix.keyframes].filter(([, e]) => e.defs.length).map(([name, e]) => ({ label: name, type: "function", detail: `@keyframes · ${firstLoc(e.defs)}`, boost: 3, section: SEC.project }));
    if (opts.length) return { from: ctx.pos - m[1].length, options: opts, validFor: /^[\w-]*$/ };
  }
  m = /font-family\s*:\s*([^;{}]*)$/.exec(txt);
  if (m) {
    const part = /[^,]*$/.exec(m[1])![0];
    const word = part.trimStart();
    const q = (n: string) => (/\s/.test(n) ? `"${n}"` : n);
    const opts: Completion[] = [
      ...[...getIndex().fonts].map(([name, e]) => ({ label: q(name), type: "constant", detail: e.defs[0]?.extra, section: SEC.project, boost: 3 })),
      ...["Material Symbols Rounded", "Material Symbols Outlined", "Material Symbols Sharp"]
        .filter((n) => !getIndex().fonts.has(n))
        .map((n) => ({ label: `"${n}"`, type: "constant", detail: "ícones", section: SEC.icons })),
      ...(m[1].includes(",") ? [] : FONT_STACKS.map((f) => ({ label: f, type: "constant", detail: "pilha de fontes", section: SEC.suggest }))),
      ...GENERIC_FONTS.map((f) => ({ label: f, type: "keyword", section: SEC.suggest })),
    ];
    return { from: ctx.pos - word.length, options: opts, validFor: /^[^,;]*$/ };
  }

  const inBlock = cssInBlock(ctx.state, ctx.pos);
  if (!inBlock) {
    const w = ctx.matchBefore(/[.#][\w-]*$/);
    if (w) {
      const isClass = w.text.startsWith(".");
      return { from: w.from, options: isClass ? classOptions(true) : idOptions(true, "any"), validFor: /^[.#][\w-]*$/ };
    }
    const at = ctx.matchBefore(/\[d[\w-]*$/);
    if (at) {
      const opts = [...getIndex().dataAttrs.keys()].map((k) => ({ label: "data-" + k, type: "property", section: SEC.project }));
      if (opts.length) return { from: at.from + 1, options: opts, validFor: /^[\w-]*$/ };
    }
  } else {
    const w = ctx.matchBefore(/(^|[;{\s])--[\w-]*$/);
    if (w) {
      const word = /--[\w-]*$/.exec(w.text)![0];
      const ix = getIndex();
      return { from: ctx.pos - word.length, options: [...ix.vars.keys()].map((n) => ({ label: n, type: "variable", apply: n + ": ", section: SEC.project })), validFor: /^--[\w-]*$/ };
    }
  }
  return null;
};

/* ---------------- JavaScript ---------------- */

const EVENTS = "click dblclick input change submit reset keydown keyup focus blur focusin focusout load DOMContentLoaded scroll scrollend resize mouseenter mouseleave mousemove mousedown mouseup mouseover mouseout pointerdown pointermove pointerup pointerenter pointerleave pointercancel wheel contextmenu touchstart touchmove touchend animationstart animationend transitionend dragstart drag dragend dragenter dragover dragleave drop copy cut paste visibilitychange beforeunload hashchange popstate message error play pause ended timeupdate loadeddata toggle".split(" ");

const JS_SNIPPETS: Completion[] = [
  snip("console.log(${});", { label: "log", detail: "console.log()", type: "function", section: SEC.snippets }),
  snip("document.querySelector('${seletor}')", { label: "qs", detail: "querySelector", type: "function", section: SEC.snippets }),
  snip("document.querySelectorAll('${seletor}')", { label: "qsa", detail: "querySelectorAll", type: "function", section: SEC.snippets }),
  snip("${el}.addEventListener('${click}', (evento) => {\n\t${}\n});", { label: "ael", detail: "addEventListener", type: "function", section: SEC.snippets }),
  snip("function ${nome}(${parametros}) {\n\t${}\n}", { label: "fn", detail: "função", type: "keyword", section: SEC.snippets }),
  snip("const ${nome} = (${parametros}) => {\n\t${}\n};", { label: "arrow", detail: "arrow function", type: "keyword", section: SEC.snippets }),
  snip("async function ${nome}() {\n\tconst resposta = await fetch('${url}');\n\tconst dados = await resposta.json();\n\t${}\n}", { label: "fetchjson", detail: "fetch + JSON", type: "keyword", section: SEC.snippets }),
  snip("for (const ${item} of ${lista}) {\n\t${}\n}", { label: "forof", detail: "for…of", type: "keyword", section: SEC.snippets }),
  snip("for (let ${i} = 0; ${i} < ${lista}.length; ${i}++) {\n\t${}\n}", { label: "fori", detail: "for clássico", type: "keyword", section: SEC.snippets }),
  snip("setTimeout(() => {\n\t${}\n}, ${1000});", { label: "timeout", detail: "setTimeout", type: "function", section: SEC.snippets }),
  snip("setInterval(() => {\n\t${}\n}, ${1000});", { label: "interval", detail: "setInterval", type: "function", section: SEC.snippets }),
  snip("function ${quadro}(tempo) {\n\t${}\n\trequestAnimationFrame(${quadro});\n}\nrequestAnimationFrame(${quadro});", { label: "raf", detail: "loop de animação", type: "keyword", section: SEC.snippets }),
  snip("localStorage.setItem('${chave}', JSON.stringify(${valor}));", { label: "lsset", detail: "salvar no localStorage", type: "function", section: SEC.snippets }),
  snip("JSON.parse(localStorage.getItem('${chave}') ?? '${null}')", { label: "lsget", detail: "ler do localStorage", type: "function", section: SEC.snippets }),
  snip("try {\n\t${}\n} catch (erro) {\n\tconsole.error(erro);\n}", { label: "trycatch", detail: "try/catch", type: "keyword", section: SEC.snippets }),
  snip("const ${el} = document.createElement('${div}');\n${el}.className = '${classe}';\n${pai}.append(${el});", { label: "create", detail: "criar e anexar elemento", type: "function", section: SEC.snippets }),
  snip("class ${Nome} {\n\tconstructor(${}) {\n\t\t${}\n\t}\n}", { label: "classe", detail: "class", type: "keyword", section: SEC.snippets }),
  snip("document.addEventListener('DOMContentLoaded', () => {\n\t${}\n});", { label: "ready", detail: "quando o DOM carregar", type: "function", section: SEC.snippets }),
  snip("const observador = new IntersectionObserver((entradas) => {\n\tfor (const e of entradas) {\n\t\tif (e.isIntersecting) ${e.target.classList.add('visivel')};\n\t}\n});\ndocument.querySelectorAll('${.revelar}').forEach((el) => observador.observe(el));", { label: "observer", detail: "animar ao rolar", type: "function", section: SEC.snippets }),
  snip("${lista}.map((${item}) => ${item})", { label: "map", detail: "array.map", type: "function", section: SEC.snippets }),
  snip("${lista}.filter((${item}) => ${condicao})", { label: "filter", detail: "array.filter", type: "function", section: SEC.snippets }),
  snip("const { ${a}, ${b} } = ${objeto};", { label: "destr", detail: "desestruturar", type: "keyword", section: SEC.snippets }),
  snip("import { ${nome} } from './${arquivo}.js';", { label: "imp", detail: "import nomeado", type: "keyword", section: SEC.snippets }),
  snip("export function ${nome}(${}) {\n\t${}\n}", { label: "expfn", detail: "export function", type: "keyword", section: SEC.snippets }),
];

const camel = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

function inJsString(state: EditorState, pos: number) {
  const n = syntaxTree(state).resolveInner(pos, -1);
  return n.name === "String" || n.name === "TemplateString" || n.name === "LineComment" || n.name === "BlockComment";
}

const jsExtras: CompletionSource = async (ctx) => {
  const txt = before(ctx);
  let m = /\b(querySelector(?:All)?|closest|matches)\(\s*(["'`])([^"'`]*)$/.exec(txt);
  if (m) {
    const w = /[.#]?[\w-]*$/.exec(m[3])![0];
    const tags = [...getIndex().tags.keys()].map((t) => ({ label: t, type: "type", section: SEC.project, detail: "tag usada" }));
    const opts = w.startsWith("#") ? idOptions(true, "any") : w.startsWith(".") ? classOptions(true) : [...classOptions(true), ...idOptions(true, "any"), ...tags];
    return { from: ctx.pos - w.length, options: opts, validFor: /^[.#]?[\w-]*$/ };
  }
  m = /\bgetElementById\(\s*(["'`])([\w-]*)$/.exec(txt);
  if (m) return { from: ctx.pos - m[2].length, options: idOptions(false, "html"), validFor: /^[\w-]*$/ };
  m = /\bgetElementsByClassName\(\s*(["'`])([\w-]*)$/.exec(txt) ?? /\bclassList\.(?:add|remove|toggle|contains|replace)\((?:[^)]*,\s*)?(["'`])([\w-]*)$/.exec(txt);
  if (m) return { from: ctx.pos - m[2].length, options: classOptions(false).filter((o) => o.section === SEC.project), validFor: /^[\w-]*$/ };
  m = /\b(?:getElementsByTagName|createElement)\(\s*(["'`])([\w-]*)$/.exec(txt);
  if (m) return { from: ctx.pos - m[2].length, options: tagNames(), validFor: /^[\w-]*$/ };
  m = /\b(?:add|remove)EventListener\(\s*(["'`])(\w*)$/.exec(txt);
  if (m) return { from: ctx.pos - m[2].length, options: EVENTS.map((e) => ({ label: e, type: "constant", detail: "evento" })), validFor: /^\w*$/ };
  m = /\b(?:local|session)Storage\.(?:getItem|setItem|removeItem)\(\s*(["'`])([^"'`]*)$/.exec(txt);
  if (m) {
    const opts = [...getIndex().storageKeys].map(([k, e]) => ({ label: k, type: "constant", section: SEC.project, detail: e.defs.length ? `salva em ${firstLoc(e.defs)}` : "lida no projeto" }));
    return opts.length ? { from: ctx.pos - m[2].length, options: opts, validFor: /^[^"'`]*$/ } : null;
  }
  m = /\bsetAttribute\(\s*(["'`])(src|href)\1\s*,\s*(["'`])([^"'`]*)$/.exec(txt) ?? /\.(src|href|poster)\s*=\s*(["'`])([^"'`]*)$/.exec(txt);
  if (m) {
    const value = m[4] ?? m[3];
    const prop = m[2] === "href" || m[1] === "href" ? "href" : "src";
    return { from: ctx.pos - value.length, options: pathOptions(prop === "href" ? () => true : (f) => f.kind !== "js" && f.kind !== "css"), validFor: /^[^"'`\s]*$/ };
  }
  m = /\bnew\s+(Audio|Image|Worker|URL)\(\s*(["'`])([^"'`]*)$/.exec(txt);
  if (m) {
    const t = m[1];
    const accept = t === "Audio" ? (f: PFile) => isMedia(f, "audio") : t === "Image" ? isImg : t === "Worker" ? (f: PFile) => f.kind === "js" : () => true;
    return { from: ctx.pos - m[3].length, options: pathOptions(accept), validFor: /^[^"'`\s]*$/ };
  }
  m = /\b(fetch|import)\(\s*(["'`])([^"'`]*)$/.exec(txt) ?? /\bfrom\s+(["'])()([^"']*)$/.exec(txt);
  if (m) {
    const isImport = m[1] === "import" || /\bfrom\s/.test(m[0]);
    const value = m[3];
    return { from: ctx.pos - value.length, options: pathOptions((f) => (isImport ? f.kind === "js" : true), { prefixDot: isImport }), validFor: /^[^"'`\s]*$/ };
  }
  m = /\.dataset\.([\w$]*)$/.exec(txt);
  if (m) {
    const opts = [...getIndex().dataAttrs.keys()].map((k) => ({ label: camel(k), type: "property", detail: `data-${k}`, section: SEC.project }));
    return opts.length ? { from: ctx.pos - m[1].length, options: opts, validFor: /^[\w$]*$/ } : null;
  }
  m = /\.style\.([\w$]*)$/.exec(txt);
  if (m) {
    await ensureMdn();
    const names = new Set([...Object.keys(CSS_PROPS), ...Object.keys(mdnNow()?.css ?? {})]);
    const opts = [...names]
      .filter((n) => !n.startsWith("-"))
      .map((n) => ({ label: camel(n), type: "property", detail: n, boost: CSS_PROPS[n] ? 1 : 0, info: () => { const d = cssPropDoc(n); return d ? renderDoc(d, { compact: true }) : null; } }));
    opts.push({ label: "setProperty", type: "method", detail: "('--var', valor)", boost: 0, info: () => null });
    return { from: ctx.pos - m[1].length, options: opts, validFor: /^[\w$]*$/ };
  }
  if (inJsString(ctx.state, ctx.pos)) return null;
  const w = ctx.matchBefore(/[\w$]+$/);
  if (!w && !ctx.explicit) return null;
  if (w && /\.\s*$/.test(ctx.state.sliceDoc(Math.max(0, w.from - 2), w.from))) return null; // depois de "." quem responde é o escopo
  const ix = getIndex();
  const opts: Completion[] = [...JS_SNIPPETS];
  for (const [name, e] of ix.functions) {
    const other = e.defs.find((d) => d.fileId !== currentFile?.id);
    if (!other) continue;
    opts.push({
      label: name,
      type: other.extra === "class" ? "class" : "function",
      detail: firstLoc([other]),
      section: SEC.project,
      info: () => renderDoc({ title: name, kind: other.extra === "class" ? "Classe do projeto" : "Função do projeto", desc: "" }, { compact: true, sections: [{ title: "Declaração", items: e.defs }] }),
    });
  }
  return { from: w ? w.from : ctx.pos, options: opts, validFor: /^[\w$]*$/ };
};

/* ---------------- abre sozinho ao cair num valor vazio ---------------- */

const AUTO_OPEN = [
  /\s(src|href|poster|srcset|action)\s*=\s*["']$/,
  /\sclass\s*=\s*["']$/,
  /\s(for|id)\s*=\s*["']$/,
  /url\(\s*["']?$/,
  /\b(fetch|import|getElementById|querySelector(All)?|createElement)\(\s*["'`]$/,
  /\bclassList\.\w+\(\s*["'`]$/,
  /\b(add|remove)EventListener\(\s*["'`]$/,
  /\bfrom\s+["']$/,
  /class\s*=\s*["'][^"']*material-symbols-\w+[^"']*["'][^<>]*>$/,
  /\.(dataset|style)\.$/,
];

export const autoOpenCompletion = EditorView.updateListener.of((u) => {
  if (!u.docChanged && !u.selectionSet) return;
  const sel = u.state.selection.main;
  if (!sel.empty || completionStatus(u.state) === "active") return;
  const prevHead = u.startState.selection.main.head;
  if (prevHead === sel.head && !u.docChanged) return;
  const txt = u.state.sliceDoc(Math.max(0, sel.head - 200), sel.head);
  // abre como se fosse digitação (modo implícito): a lista some sozinha quando o contexto acaba,
  // em vez de ficar presa mostrando todos os globais
  if (AUTO_OPEN.some((re) => re.test(txt))) setTimeout(() => u.view.dispatch({ annotations: Transaction.userEvent.of("input.type") }), 0);
});

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
  kind === "html" || /\.svg$/i.test(name) ? "html" : kind === "css" ? "css" : kind === "js" ? "js" : kindOf(name) === "html" ? "html" : "other";
