// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/** Verificação ao vivo de HTML, CSS, JS e JSON com sugestões de correção.
 *  Tags, atributos, propriedades e valores escritos errado ganham sublinhado; ao clicar
 *  (ou Ctrl+.), um cartão mostra as correções possíveis. */
import { StateEffect, StateField, type EditorState } from "@codemirror/state";
import { EditorView, keymap, showTooltip, type Tooltip } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { forEachDiagnostic, linter, type Action, type Diagnostic } from "@codemirror/lint";
import type { SyntaxNode } from "@lezer/common";
import { CSS_PROPS, HTML_ATTRS, HTML_TAGS, loadMdn, mdnNow } from "@/lib/docs";
import { getIndex } from "@/lib/indexer";
import { dirName, resolvePath } from "@/lib/files";
import type { PFile } from "@/lib/types";

/* ---------------- distância de edição ---------------- */

export function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = [];
  for (let i = 0; i <= a.length; i++) d[i] = [i];
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** Candidatos mais parecidos (no máximo 3). */
export function closest(word: string, candidates: Iterable<string>, limit = 3): string[] {
  const w = word.toLowerCase();
  const max = w.length <= 3 ? 1 : w.length <= 6 ? 2 : 3;
  const scored: [string, number][] = [];
  for (const c of candidates) {
    if (!c || c === word) continue;
    const cl = c.toLowerCase();
    let dist = distance(w, cl, max);
    // prefixo forte (ex.: "backgro" → "background") conta como próximo
    if (dist > max && cl.startsWith(w) && w.length >= 4) dist = max;
    if (dist <= max) scored.push([c, dist - (cl[0] === w[0] ? 0.5 : 0)]);
  }
  scored.sort((a, b) => a[1] - b[1] || a[0].length - b[0].length);
  return scored.slice(0, limit).map(([c]) => c);
}

/* ---------------- vocabulários ---------------- */

const SVG_TAGS = "svg g path circle rect line polyline polygon ellipse text tspan textpath defs use symbol lineargradient radialgradient stop clippath mask pattern filter image foreignobject animate animatetransform animatemotion marker desc view switch feblend fecolormatrix fecomposite feflood fegaussianblur feimage femerge femergenode feoffset feturbulence fedisplacementmap fedropshadow math mi mo mn ms mtext mrow mfrac msqrt mroot msup msub mtable mtr mtd".split(" ");
const VOID = new Set("area base br col embed hr img input link meta source track wbr".split(" "));
const OPTIONAL_CLOSE = new Set("html head body p li dt dd tr td th thead tbody tfoot option optgroup colgroup caption rp rt".split(" "));
const EXTRA_ATTRS =
  "loading decoding srcset sizes crossorigin integrity referrerpolicy fetchpriority popover popovertarget popovertargetaction inert enterkeyhint inputmode is slot part nonce autofocus playsinline allowfullscreen allow sandbox srcdoc frameborder property xmlns viewbox fill stroke d charset content name http-equiv rel href src alt type value placeholder required disabled readonly checked selected multiple min max step pattern for action method width height target download controls autoplay loop muted poster preload colspan rowspan scope headers open label list maxlength minlength accept capture form formaction novalidate wrap cols rows span start reversed datetime cite media async defer nomodule shape coords usemap ismap kind srclang default hreflang ping as blocking spellcheck translate autocapitalize writingsuggestions"
    .split(" ");
const GLOBAL_VALUES = new Set(["inherit", "initial", "unset", "revert", "revert-layer"]);
const CLOSED_VALUE_PROPS = [
  "display", "position", "text-align", "flex-direction", "flex-wrap", "justify-content", "align-items", "align-content", "align-self",
  "justify-items", "justify-self", "visibility", "overflow", "overflow-x", "overflow-y", "font-style", "text-transform", "white-space",
  "box-sizing", "float", "clear", "object-fit", "pointer-events", "resize", "user-select", "border-style", "list-style-position",
  "text-decoration-style", "background-repeat", "background-attachment", "background-size", "table-layout", "border-collapse", "direction",
  "writing-mode", "word-break", "overflow-wrap", "scroll-behavior", "isolation", "backface-visibility", "font-kerning", "text-overflow", "appearance",
];
const EXTRA_VALUES: Record<string, string[]> = {
  display: ["flex", "grid", "inline-flex", "inline-grid", "block", "inline", "inline-block", "none", "contents", "flow-root", "table", "table-cell", "table-row", "list-item"],
  "justify-content": ["center", "start", "end", "flex-start", "flex-end", "left", "right", "space-between", "space-around", "space-evenly", "stretch", "normal"],
  "align-items": ["center", "start", "end", "flex-start", "flex-end", "baseline", "stretch", "normal", "self-start", "self-end"],
  "align-self": ["auto", "center", "start", "end", "flex-start", "flex-end", "baseline", "stretch", "normal"],
  "align-content": ["center", "start", "end", "flex-start", "flex-end", "space-between", "space-around", "space-evenly", "stretch", "normal", "baseline"],
  "justify-items": ["center", "start", "end", "stretch", "normal", "left", "right", "baseline"],
  "justify-self": ["auto", "center", "start", "end", "stretch", "normal", "left", "right", "baseline"],
  position: ["static", "relative", "absolute", "fixed", "sticky"],
  "background-size": ["cover", "contain", "auto"],
  "text-overflow": ["clip", "ellipsis"],
  "overflow-wrap": ["normal", "break-word", "anywhere"],
  "white-space": ["normal", "nowrap", "pre", "pre-wrap", "pre-line", "break-spaces"],
  appearance: ["none", "auto", "menulist-button", "textfield"],
};

let cache: {
  tags: Set<string>;
  attrs: Set<string>;
  css: Set<string>;
  pseudo: Set<string>;
  values: Map<string, Set<string>>;
} | null = null;

function vocab() {
  const mdn = mdnNow();
  if (cache && mdn) return cache;
  const tags = new Set([...Object.keys(HTML_TAGS), ...Object.keys(mdn?.tags ?? {}), ...SVG_TAGS, "search"]);
  tags.delete("!doctype");
  const events = Object.getOwnPropertyNames(HTMLElement.prototype)
    .concat(Object.getOwnPropertyNames(Element.prototype), Object.getOwnPropertyNames(Document.prototype), Object.getOwnPropertyNames(Window.prototype))
    .filter((n) => /^on[a-z]+$/.test(n));
  const attrs = new Set([...Object.keys(HTML_ATTRS), ...Object.keys(mdn?.attrs ?? {}), ...EXTRA_ATTRS, ...events]);
  for (const t of Object.values(mdn?.tags ?? {})) for (const a of Object.keys(t[1])) attrs.add(a);
  const css = new Set([...Object.keys(CSS_PROPS), ...Object.keys(mdn?.css ?? {})]);
  for (const p of Array.from(document.documentElement.style)) css.add(p);
  for (const k in document.documentElement.style) if (/^[a-z]/.test(k) && typeof (document.documentElement.style as unknown as Record<string, unknown>)[k] === "string") css.add(k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()));
  const pseudo = new Set(Object.keys(mdn?.pseudo ?? {}).map((p) => p.replace(/\(.*$/, "")));
  const values = new Map<string, Set<string>>();
  for (const p of CLOSED_VALUE_PROPS) {
    const vs = new Set([...(mdn?.css[p]?.[2] ?? []), ...(EXTRA_VALUES[p] ?? [])]);
    if (vs.size) values.set(p, vs);
  }
  const v = { tags, attrs, css, pseudo, values };
  if (mdn) cache = v;
  return v;
}

/** Nomes de propriedades e métodos conhecidos de JS/DOM (por introspecção do próprio navegador). */
let jsKnown: Set<string> | null = null;
function jsVocab() {
  if (jsKnown) return jsKnown;
  const s = new Set<string>();
  const add = (o: unknown) => {
    for (let p = o; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) for (const n of Object.getOwnPropertyNames(p)) s.add(n);
  };
  const g = globalThis as unknown as Record<string, { prototype?: unknown } | undefined>;
  for (const name of [
    "HTMLElement", "HTMLInputElement", "HTMLSelectElement", "HTMLTextAreaElement", "HTMLFormElement", "HTMLCanvasElement", "HTMLMediaElement", "HTMLVideoElement",
    "HTMLImageElement", "HTMLAnchorElement", "HTMLButtonElement", "HTMLDialogElement", "HTMLTemplateElement", "SVGElement", "Element", "Node", "EventTarget",
    "Document", "Event", "KeyboardEvent", "MouseEvent", "PointerEvent", "TouchEvent", "WheelEvent", "InputEvent", "SubmitEvent", "DragEvent", "CustomEvent",
    "CanvasRenderingContext2D", "Array", "String", "Number", "Promise", "Map", "Set", "WeakMap", "Date", "RegExp", "Function", "NodeList", "HTMLCollection",
    "DOMTokenList", "DOMRect", "CSSStyleDeclaration", "Response", "Request", "Headers", "URL", "URLSearchParams", "FormData", "Blob", "File", "FileReader",
    "Storage", "IntersectionObserver", "ResizeObserver", "MutationObserver", "AbortController", "Audio", "Image", "Animation", "TextEncoder", "Error",
  ]) {
    if (g[name]?.prototype) add(g[name]!.prototype);
    if (g[name]) add(g[name]);
  }
  for (const o of [globalThis, document, console, Math, JSON, navigator, location, history, Object, Array, Number, String, Promise, Reflect, Intl, crypto]) add(o);
  for (const k in document.documentElement.style) s.add(k);
  jsKnown = s;
  return s;
}

const COMMON_GLOBALS = [
  "document", "window", "console", "Math", "JSON", "setTimeout", "setInterval", "clearTimeout", "clearInterval", "fetch", "localStorage", "sessionStorage",
  "requestAnimationFrame", "cancelAnimationFrame", "alert", "confirm", "prompt", "Array", "Object", "Promise", "Number", "String", "Boolean", "parseInt",
  "parseFloat", "navigator", "location", "history", "Date", "structuredClone", "addEventListener", "removeEventListener", "Symbol", "Map", "Set", "Error",
  "undefined", "null", "true", "false", "this", "innerWidth", "innerHeight", "devicePixelRatio", "IntersectionObserver", "ResizeObserver", "FormData", "URL",
];

/** Palavras definidas pelo próprio projeto (variáveis, funções, propriedades atribuídas, chaves de JSON). */
function projectWords(): Set<string> {
  const s = new Set<string>();
  for (const f of getIndex().files) {
    if (f.kind === "js" || f.kind === "html") {
      for (const m of f.content.matchAll(/\b(?:const|let|var|function\*?|class|async function)\s+([A-Za-z_$][\w$]*)/g)) s.add(m[1]);
      for (const m of f.content.matchAll(/\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) s.add(m[1]);
      for (const m of f.content.matchAll(/[{,]\s*([A-Za-z_$][\w$]*)\s*[:(,}]/g)) s.add(m[1]);
      for (const m of f.content.matchAll(/^\s*(?:static\s+|async\s+|get\s+|set\s+|#)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm)) s.add(m[1]);
      for (const m of f.content.matchAll(/\(([^()]*)\)\s*=>|function\s*[\w$]*\s*\(([^()]*)\)/g))
        for (const p of (m[1] ?? m[2] ?? "").split(/[,\s{}[\]=]+/)) if (p) s.add(p.replace(/^\.\.\./, ""));
      for (const m of f.content.matchAll(/\b(?:const|let|var)\s*[{[]([^}\]]*)[}\]]/g)) for (const p of m[1].split(/[,\s:=]+/)) if (p) s.add(p);
      for (const m of f.content.matchAll(/\bimport\s*\{([^}]*)\}/g)) for (const p of m[1].split(/[,\s]+|\bas\b/)) if (p) s.add(p);
      for (const m of f.content.matchAll(/\bimport\s+([A-Za-z_$][\w$]*)/g)) s.add(m[1]);
      for (const m of f.content.matchAll(/\bfor\s*\(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) s.add(m[1]);
      for (const m of f.content.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g)) s.add(m[1]);
    }
    if (f.kind === "json") for (const m of f.content.matchAll(/"([A-Za-z_$][\w$]*)"\s*:/g)) s.add(m[1]);
    if (f.kind === "html") for (const m of f.content.matchAll(/\sid\s*=\s*["']([\w$-]+)["']/g)) s.add(m[1]);
  }
  return s;
}

/* ---------------- ações de correção ---------------- */

const replace = (name: string, text: string, from?: number, to?: number): Action => ({
  name,
  apply(view, f, t) {
    view.dispatch({ changes: { from: from ?? f, to: to ?? t, insert: text } });
  },
});

function renameTagAction(node: SyntaxNode, to: string): Action {
  return {
    name: `Trocar por <${to}>`,
    apply(view) {
      const changes = [{ from: node.from, to: node.to, insert: to }];
      const el = node.parent?.parent;
      const close = el?.getChild("CloseTag")?.getChild("TagName");
      if (close) changes.push({ from: close.from, to: close.to, insert: to });
      view.dispatch({ changes });
    },
  };
}

/* ---------------- verificação ---------------- */

let currentFile: PFile | null = null;
export const setLintFile = (f: PFile | null) => (currentFile = f);
export const lintIndexFiles = () => getIndex().files.length;

const parentName = (n: SyntaxNode) => n.parent?.name ?? "";
const text = (s: EditorState, n: { from: number; to: number }) => s.sliceDoc(n.from, n.to);

function inside(n: SyntaxNode, name: string) {
  for (let p: SyntaxNode | null = n.parent; p; p = p.parent) if (p.name === name) return p;
  return null;
}

function inSvg(state: EditorState, n: SyntaxNode) {
  for (let p: SyntaxNode | null = n.parent; p; p = p.parent) {
    if (p.name === "Element") {
      const tn = p.getChild("OpenTag")?.getChild("TagName");
      if (tn && /^(svg|math)$/i.test(text(state, tn))) return true;
    }
  }
  return false;
}

/** Caminho relativo existe? Devolve "ok", "aproximado" (só o nome bate) ou sugestões. */
function checkPath(ref: string, bases?: string[]): { status: "ok" } | { status: "fuzzy"; path: string } | { status: "missing"; suggestions: string[] } | null {
  if (!ref || /^(#|[a-z][a-z0-9+.-]*:|\/\/|\$\{|\{\{|<%)/i.test(ref.trim())) return null;
  const ix = getIndex();
  if (!ix.files.length) return null;
  const dir = currentFile ? dirName(currentFile.name) : "";
  const p = resolvePath(ref, dir);
  if (p == null) return null;
  for (const b of [dir, ...(bases ?? [])]) {
    const q = resolvePath(ref, b);
    if (q != null && (ix.files.some((f) => f.name === q) || (ix.files.some((f) => f.name.startsWith(q + "/")) && ref.endsWith("/")))) return { status: "ok" };
  }
  const rel = (target: string) => {
    if (!dir) return target;
    const a = dir.split("/");
    const b = target.split("/");
    while (a.length && b.length > 1 && a[0] === b[0]) a.shift(), b.shift();
    return "../".repeat(a.length) + b.join("/");
  };
  const base = p.split("/").pop()!.toLowerCase();
  const same = ix.files.find((f) => f.name.split("/").pop()!.toLowerCase() === base);
  if (same) return { status: "fuzzy", path: rel(same.name) };
  const names = ix.files.map((f) => f.name);
  const sug = closest(base, names.map((n) => n.split("/").pop()!)).map((b) => rel(names.find((n) => n.split("/").pop() === b)!));
  return { status: "missing", suggestions: sug };
}

function pathDiagnostic(from: number, to: number, ref: string, bases?: string[]): Diagnostic | null {
  const r = checkPath(ref, bases);
  if (!r || r.status === "ok") return null;
  if (r.status === "fuzzy")
    return {
      from,
      to,
      severity: "warning",
      source: "Poiesis",
      message: `“${ref}” não existe nesse caminho — o arquivo está em “${r.path}”. Funciona no preview, mas quebra fora dele.`,
      actions: [replace(`Corrigir para ${r.path}`, r.path)],
    };
  return {
    from,
    to,
    severity: "warning",
    source: "Poiesis",
    message: `Arquivo “${ref}” não encontrado no projeto.${r.suggestions.length ? ` Você quis dizer “${r.suggestions[0]}”?` : ""}`,
    actions: r.suggestions.map((s) => replace(`Usar ${s}`, s)),
  };
}

function lintMarkup(state: EditorState): Diagnostic[] {
  const out: Diagnostic[] = [];
  const v = vocab();
  const tree = syntaxTree(state);
  const ix = getIndex();
  const definedVars = new Set([...ix.vars].filter(([, e]) => e.defs.length).map(([k]) => k));
  const idsInFile = new Map<string, number>();
  const js = jsVocab();
  let words: Set<string> | null = null;
  const jsDeclared = new Set<string>();
  tree.iterate({
    enter: (ref) => {
      if (ref.name === "VariableDefinition" || ref.name === "PropertyDefinition") jsDeclared.add(text(state, ref));
    },
  });

  tree.iterate({
    enter: (ref) => {
      const n = ref.node;
      const name = n.name;

      /* ---------- HTML ---------- */
      if (name === "TagName" && (parentName(n) === "OpenTag" || parentName(n) === "SelfClosingTag")) {
        const tag = text(state, n).toLowerCase();
        if (tag.includes("-") || v.tags.has(tag) || inSvg(state, n)) return;
        const sug = closest(tag, v.tags);
        out.push({
          from: n.from,
          to: n.to,
          severity: sug.length ? "error" : "warning",
          source: "HTML",
          message: `A tag <${tag}> não existe no HTML.${sug.length ? ` Você quis dizer <${sug[0]}>?` : " Se for um componente próprio, use um nome com hífen (ex.: <meu-card>)."}`,
          actions: sug.map((s) => renameTagAction(n, s)),
        });
        return;
      }
      if (name === "Element") {
        const open = n.getChild("OpenTag");
        const tn = open?.getChild("TagName");
        if (open && tn && !n.getChild("CloseTag") && !n.getChild("MismatchedCloseTag")) {
          const tag = text(state, tn).toLowerCase();
          if (!VOID.has(tag) && !OPTIONAL_CLOSE.has(tag) && v.tags.has(tag) && !inSvg(state, tn)) {
            out.push({
              from: open.from,
              to: open.to,
              severity: "warning",
              source: "HTML",
              message: `<${tag}> foi aberta e não foi fechada.`,
              actions: [
                {
                  name: `Fechar com </${tag}>`,
                  apply(view) {
                    const end = n.to;
                    view.dispatch({ changes: { from: end, insert: `</${tag}>` } });
                  },
                },
              ],
            });
          }
        }
        return;
      }
      if (name === "MismatchedCloseTag") {
        const el = n.parent;
        const expected = el?.getChild("OpenTag")?.getChild("TagName");
        const exp = expected ? text(state, expected).toLowerCase() : null;
        const got = /<\/\s*([\w-]*)/.exec(text(state, n))?.[1] ?? "?";
        out.push({
          from: n.from,
          to: n.to,
          severity: "error",
          source: "HTML",
          message: exp ? `</${got}> não fecha nada aqui — o elemento aberto é <${exp}>.` : `</${got}> não tem uma tag de abertura correspondente.`,
          actions: [...(exp ? [replace(`Trocar por </${exp}>`, `</${exp}>`)] : []), replace("Remover", "")],
        });
        return;
      }
      if (name === "IncompleteCloseTag") {
        out.push({ from: n.from, to: n.to, severity: "error", source: "HTML", message: "Tag de fechamento incompleta (faltou o “>”?)." });
        return;
      }
      if (name === "AttributeName" && /^(OpenTag|SelfClosingTag)$/.test(n.parent?.parent?.name ?? "")) {
        const attr = text(state, n).toLowerCase();
        const tagNode = n.parent!.parent!.getChild("TagName");
        const tag = tagNode ? text(state, tagNode).toLowerCase() : "";
        // duplicados
        const siblings = n.parent!.parent!.getChildren("Attribute").map((a) => a.getChild("AttributeName")).filter(Boolean) as SyntaxNode[];
        if (siblings.filter((s) => text(state, s).toLowerCase() === attr).length > 1 && siblings.find((s) => text(state, s).toLowerCase() === attr) !== n)
          out.push({ from: n.from, to: n.to, severity: "warning", source: "HTML", message: `O atributo “${attr}” aparece duas vezes nesta tag; só o primeiro vale.`, actions: [replace("Remover este", "", n.parent!.from - 1, n.parent!.to)] });
        if (/^(data-|aria-|on|x-|v-|hx-|:|@|#|\*|\[)/.test(attr) || attr.includes(":") || inSvg(state, n) || tag.includes("-")) return;
        if (v.attrs.has(attr)) return;
        const tagAttrs = Object.keys(mdnNow()?.tags[tag]?.[1] ?? {});
        const sug = closest(attr, [...tagAttrs, ...v.attrs]);
        if (sug.length)
          out.push({
            from: n.from,
            to: n.to,
            severity: "warning",
            source: "HTML",
            message: `“${attr}” não é um atributo conhecido de <${tag}>. Você quis dizer “${sug[0]}”?`,
            actions: sug.map((s) => replace(`Trocar por ${s}`, s)),
          });
        return;
      }
      if (name === "AttributeValue" && n.parent?.name === "Attribute") {
        const an = n.parent.getChild("AttributeName");
        const attr = an ? text(state, an).toLowerCase() : "";
        const raw = text(state, n);
        const quoted = /^["']/.test(raw);
        const val = raw.replace(/^["']|["']$/g, "");
        const from = n.from + (quoted ? 1 : 0);
        const to = from + val.length;
        const tagNode = n.parent.parent?.getChild("TagName");
        const tag = tagNode ? text(state, tagNode).toLowerCase() : "";
        if (/^(src|href|poster|data|action)$/.test(attr) && !(tag === "a" && val.startsWith("#")) && !(attr === "data" && tag !== "object") && !(tag === "form" && !val)) {
          const d = pathDiagnostic(from, to, val);
          if (d) out.push(d);
        }
        if (attr === "href" && tag === "a" && /^#[\w-]+$/.test(val)) {
          const id = val.slice(1);
          const ids = [...ix.ids].filter(([, e]) => e.defs.some((x) => x.fileId === currentFile?.id)).map(([k]) => k);
          if (ids.length && !ids.includes(id)) {
            const sug = closest(id, ids);
            out.push({ from: from + 1, to, severity: "warning", source: "HTML", message: `Nenhum elemento com id="${id}" nesta página.${sug.length ? ` Você quis dizer “${sug[0]}”?` : ""}`, actions: sug.map((s) => replace(`Usar #${s}`, s)) });
          }
        }
        if (attr === "id" && val) {
          const prev = idsInFile.get(val);
          if (prev != null) out.push({ from, to, severity: "warning", source: "HTML", message: `O id “${val}” já foi usado nesta página — ids devem ser únicos.` });
          else idsInFile.set(val, from);
        }
        return;
      }
      if (name === "OpenTag" || name === "SelfClosingTag") {
        const tn = n.getChild("TagName");
        if (tn && text(state, tn).toLowerCase() === "img" && !n.getChildren("Attribute").some((a) => a.getChild("AttributeName") && text(state, a.getChild("AttributeName")!).toLowerCase() === "alt")) {
          out.push({
            from: tn.from,
            to: tn.to,
            severity: "info",
            source: "Acessibilidade",
            message: "Imagem sem alt: leitores de tela não sabem o que ela mostra.",
            actions: [{ name: 'Adicionar alt=""', apply: (view) => view.dispatch({ changes: { from: tn.to, insert: ' alt=""' } }) }],
          });
        }
        return;
      }

      /* ---------- CSS ---------- */
      if (name === "PropertyName" && parentName(n) === "Declaration") {
        const prop = text(state, n).toLowerCase();
        if (prop.startsWith("--")) return;
        const base = prop.replace(/^-(webkit|moz|ms|o)-/, "");
        if (v.css.has(prop) || v.css.has(base)) {
          // valores fechados (display: flx)
          const allowed = v.values.get(base);
          if (allowed) {
            for (let c = n.parent!.firstChild; c; c = c.nextSibling) {
              if (c.name !== "ValueName") continue;
              const val = text(state, c).toLowerCase();
              if (allowed.has(val) || GLOBAL_VALUES.has(val)) continue;
              const sug = closest(val, allowed);
              out.push({
                from: c.from,
                to: c.to,
                severity: sug.length ? "error" : "warning",
                source: "CSS",
                message: `“${val}” não é um valor válido para ${base}.${sug.length ? ` Você quis dizer “${sug[0]}”?` : ""}`,
                actions: sug.map((s) => replace(`Trocar por ${s}`, s)),
              });
            }
          }
          return;
        }
        const sug = closest(base, v.css);
        out.push({
          from: n.from,
          to: n.to,
          severity: sug.length ? "error" : "warning",
          source: "CSS",
          message: `A propriedade “${prop}” não existe.${sug.length ? ` Você quis dizer “${sug[0]}”?` : ""}`,
          actions: sug.map((s) => replace(`Trocar por ${s}`, s)),
        });
        return;
      }
      if (name === "VariableName" && text(state, n).startsWith("--") && inside(n, "ArgList")) {
        const call = inside(n, "CallExpression");
        const callee = call?.firstChild;
        if (!callee || text(state, callee) !== "var") return;
        // só o primeiro argumento (o resto é fallback)
        const args = n.parent;
        if (args && args.name === "ArgList" && args.getChild("VariableName")?.from !== n.from) return;
        const vn = text(state, n);
        if (definedVars.has(vn) || !ix.files.length) return;
        const sug = closest(vn, definedVars);
        out.push({
          from: n.from,
          to: n.to,
          severity: "warning",
          source: "CSS",
          message: `A variável ${vn} não foi definida no projeto.${sug.length ? ` Você quis dizer ${sug[0]}?` : ""}`,
          actions: sug.map((s) => replace(`Usar ${s}`, s)),
        });
        return;
      }
      if (name === "PseudoClassName") {
        const before = state.sliceDoc(n.from - 2, n.from);
        const pfx = before.endsWith("::") ? "::" : ":";
        const ps = pfx + text(state, n).toLowerCase();
        if (!v.pseudo.size || v.pseudo.has(ps) || /^::?-(webkit|moz|ms)-/.test(ps)) return;
        const sug = closest(ps, v.pseudo);
        if (sug.length) out.push({ from: n.from - pfx.length, to: n.to, severity: "warning", source: "CSS", message: `“${ps}” não existe. Você quis dizer “${sug[0]}”?`, actions: sug.map((s) => replace(`Trocar por ${s}`, s)) });
        return;
      }
      if (name === "CallLiteral") {
        const t = text(state, n);
        const m = /^url\(\s*(["']?)([^"')]*)\1\s*\)/i.exec(t);
        if (m && m[2] && !m[2].startsWith("data:")) {
          const from = n.from + t.indexOf(m[2], 4);
          const d = pathDiagnostic(from, from + m[2].length, m[2]);
          if (d) out.push(d);
        }
        return;
      }

      /* ---------- JavaScript ---------- */
      if (name === "PropertyName" && parentName(n) === "MemberExpression") {
        const prop = text(state, n);
        if (prop.length < 4) return;
        const objNode = n.parent!.firstChild!;
        const obj = text(state, objNode);
        const g = globalThis as unknown as Record<string, unknown>;
        const fixed = ["document", "console", "Math", "JSON", "window", "localStorage", "sessionStorage", "navigator", "location", "history", "Object", "Array", "Number", "String", "Promise"];
        if (fixed.includes(obj) && g[obj] != null && objNode.name === "VariableName") {
          if (prop in (g[obj] as object)) return;
          const names: string[] = [];
          for (let p = g[obj] as object | null; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) names.push(...Object.getOwnPropertyNames(p));
          const sug = closest(prop, names);
          if (sug.length)
            out.push({ from: n.from, to: n.to, severity: "error", source: "JavaScript", message: `${obj}.${prop} não existe. Você quis dizer ${obj}.${sug[0]}?`, actions: sug.map((s) => replace(`Trocar por ${s}`, s)) });
          return;
        }
        if (js.has(prop)) return;
        words ??= projectWords();
        if (words.has(prop) || jsDeclared.has(prop)) return;
        const sug = closest(prop, js).filter((s) => !s.startsWith("_") && distance(prop.toLowerCase(), s.toLowerCase(), 2) <= 2);
        if (sug.length)
          out.push({ from: n.from, to: n.to, severity: "warning", source: "JavaScript", message: `“${prop}” parece erro de digitação. Você quis dizer “${sug[0]}”?`, actions: sug.map((s) => replace(`Trocar por ${s}`, s)) });
        return;
      }
      if (name === "VariableName" && inside(n, "Script")) {
        const id = text(state, n);
        if (id.length < 4 || id in globalThis || jsDeclared.has(id)) return;
        words ??= projectWords();
        if (words.has(id) || ix.functions.has(id)) return;
        const sug = closest(id, [...COMMON_GLOBALS, ...jsDeclared, ...ix.functions.keys()]).filter((s) => distance(id.toLowerCase(), s.toLowerCase(), 2) <= 2);
        if (sug.length)
          out.push({ from: n.from, to: n.to, severity: "error", source: "JavaScript", message: `“${id}” não está definido. Você quis dizer “${sug[0]}”?`, actions: sug.map((s) => replace(`Trocar por ${s}`, s)) });
        return;
      }
      if (name === "String" && inside(n, "Script") && parentName(n) === "ArgList") {
        const call = n.parent!.parent;
        const callee = call?.firstChild;
        const fn = callee ? state.sliceDoc(callee.from, callee.to).split(".").pop() : "";
        const val = text(state, n).slice(1, -1);
        const ids = [...ix.ids].filter(([, e]) => e.defs.length).map(([k]) => k);
        const hasHtml = ix.files.some((f) => f.kind === "html");
        if (!hasHtml) return;
        const checkId = (id: string, from: number) => {
          if (!id || ids.includes(id)) return;
          const sug = closest(id, ids);
          out.push({ from, to: from + id.length, severity: "warning", source: "Projeto", message: `Nenhum elemento do projeto tem id="${id}" — isso vai retornar null.${sug.length ? ` Você quis dizer “${sug[0]}”?` : ""}`, actions: sug.map((s) => replace(`Usar ${s}`, s)) });
        };
        if (fn === "getElementById") checkId(val, n.from + 1);
        else if (fn === "querySelector" || fn === "querySelectorAll") {
          const m = /^#([\w-]+)$/.exec(val.trim());
          if (m) checkId(m[1], n.from + 1 + val.indexOf(m[1]));
          const c = /^\.([\w-]+)$/.exec(val.trim());
          if (c && !ix.classes.has(c[1])) {
            const sug = closest(c[1], ix.classes.keys());
            const from = n.from + 1 + val.indexOf(c[1]);
            out.push({ from, to: from + c[1].length, severity: "warning", source: "Projeto", message: `A classe “${c[1]}” não aparece em nenhum HTML, CSS ou JS do projeto.${sug.length ? ` Você quis dizer “${sug[0]}”?` : ""}`, actions: sug.map((s) => replace(`Usar ${s}`, s)) });
          }
        } else if (fn === "fetch") {
          // fetch() é relativo à página que carrega o script, não ao arquivo .js
          const pages = ix.files.filter((f) => f.kind === "html").map((f) => dirName(f.name));
          const d = pathDiagnostic(n.from + 1, n.to - 1, val, ["", ...pages]);
          if (d) out.push(d);
        }
        return;
      }

      /* ---------- erros de sintaxe (CSS/JS embutidos e arquivos) ---------- */
      if (ref.type.isError) {
        const inCss = inside(n, "StyleSheet");
        const inJs = inside(n, "Script");
        if (!inCss && !inJs) return;
        const at = Math.min(n.from, state.doc.length);
        const end = Math.min(Math.max(n.to, at + 1), state.doc.length);
        const line = state.doc.lineAt(at);
        if (at === state.doc.length && !line.text.trim()) return;
        out.push({ from: at, to: end > at ? end : at, severity: "error", source: inCss ? "CSS" : "JavaScript", message: inCss ? "Sintaxe CSS inválida aqui (faltou “;”, “:” ou “}”?)." : "Erro de sintaxe aqui (parêntese, chave ou aspas sem fechar?)." });
      }
    },
  });
  return dedupe(out);
}

function dedupe(list: Diagnostic[]) {
  const seen = new Set<string>();
  return list.filter((d) => {
    const k = `${d.from}:${d.to}:${d.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function lintJson(state: EditorState): Diagnostic[] {
  const src = state.doc.toString();
  if (!src.trim()) return [];
  try {
    JSON.parse(src);
    return [];
  } catch (e) {
    const msg = String((e as Error).message);
    let pos = 0;
    const m = /position (\d+)/.exec(msg) ?? /column (\d+)/.exec(msg);
    if (/position (\d+)/.test(msg)) pos = +m![1];
    else {
      const lc = /line (\d+) column (\d+)/.exec(msg);
      if (lc) pos = state.doc.line(Math.min(+lc[1], state.doc.lines)).from + +lc[2] - 1;
      else pos = src.length;
    }
    pos = Math.max(0, Math.min(pos, state.doc.length));
    const actions: Action[] = [];
    // vírgula sobrando antes de } ou ]
    const trailing = /,(\s*[}\]])/.exec(src.slice(Math.max(0, pos - 40), pos + 1));
    if (trailing) {
      const at = src.lastIndexOf(",", pos);
      if (at >= 0) actions.push(replace("Remover a vírgula sobrando", "", at, at + 1));
    }
    if (/'/.test(src)) actions.push({ name: "Trocar aspas simples por duplas", apply: (v) => v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: v.state.doc.toString().replace(/'([^'\\\n]*)'/g, '"$1"') } }) });
    const pt = msg
      .replace(/^JSON\.parse: /, "")
      .replace(/Unexpected token/, "Símbolo inesperado")
      .replace(/Unexpected end of JSON input/, "O JSON terminou antes da hora")
      .replace(/Expected property name or '}'/, "Esperava o nome de uma propriedade entre aspas duplas ou '}'")
      .replace(/Expected ',' or '}' after property value/, "Esperava ',' ou '}' depois do valor")
      .replace(/Expected ',' or ']' after array element/, "Esperava ',' ou ']' depois do item")
      .replace(/Bad control character in string literal/, "Caractere de controle inválido dentro do texto")
      .replace(/in JSON at position \d+.*$/, "")
      .replace(/is not valid JSON/, "não é JSON válido");
    return [{ from: pos, to: Math.min(pos + 1, state.doc.length), severity: "error", source: "JSON", message: "JSON inválido: " + pt.trim(), actions }];
  }
}

/* ---------------- integração ---------------- */

/** Pede uma nova verificação (o índice do projeto mudou, ou um erro de execução chegou). */
const relint = StateEffect.define<null>();
export const requestRelint = (view: EditorView) => view.dispatch({ effects: relint.of(null) });

export function lintExtension(kind: () => string, extra: (state: EditorState) => Diagnostic[]) {
  return linter(
    async (view) => {
      const k = kind();
      const more = extra(view.state);
      if (k === "json") return [...lintJson(view.state), ...more];
      if (k !== "html" && k !== "css" && k !== "js") return more;
      if (!mdnNow()) await loadMdn();
      try {
        return [...lintMarkup(view.state), ...more];
      } catch (e) {
        console.warn("[poiesis] lint", e);
        return more;
      }
    },
    { delay: 450, tooltipFilter: (d, state) => (state.field(fixField, false) != null ? [] : [...d]), needsRefresh: (u) => u.transactions.some((tr) => tr.effects.some((e) => e.is(relint))) }
  );
}

/** Cartão de correção fixado ao clicar num trecho sublinhado (ou com Ctrl+.). */
const openFix = StateEffect.define<number | null>();

function diagnosticsAt(state: EditorState, pos: number) {
  const found: { d: Diagnostic; from: number; to: number }[] = [];
  forEachDiagnostic(state, (d, from, to) => {
    if (pos >= from && pos <= to) found.push({ d, from, to });
  });
  return found;
}

export function fixesAt(state: EditorState, pos: number) {
  return diagnosticsAt(state, pos);
}

const SEV_ICON: Record<string, string> = { error: "error", warning: "warning", info: "info", hint: "lightbulb" };

const fixField = StateField.define<number | null>({
  create: () => null,
  update(v, tr) {
    for (const e of tr.effects) if (e.is(openFix)) return e.value;
    if (v == null) return v;
    if (tr.docChanged) return null;
    if (tr.selection) {
      const head = tr.state.selection.main.head;
      if (!diagnosticsAt(tr.state, head).length) return null;
    }
    return v;
  },
  provide: (f) =>
    showTooltip.from(f, (pos): Tooltip | null => {
      if (pos == null) return null;
      return {
        pos,
        above: false,
        create: (view) => {
          const dom = document.createElement("div");
          dom.className = "pz-fix";
          const list = diagnosticsAt(view.state, pos);
          for (const { d, from, to } of list) {
            const row = document.createElement("div");
            row.className = "pz-fix-item";
            const head = document.createElement("div");
            head.className = "pz-fix-head";
            const ic = document.createElement("span");
            ic.className = `msr pz-fix-sev ${d.severity}`;
            ic.textContent = SEV_ICON[d.severity] ?? "info";
            const msg = document.createElement("span");
            msg.className = "pz-fix-msg";
            msg.textContent = d.message;
            head.append(ic, msg);
            row.append(head);
            if (d.actions?.length) {
              const acts = document.createElement("div");
              acts.className = "pz-fix-actions";
              d.actions.forEach((a, i) => {
                const b = document.createElement("button");
                b.className = "pz-fix-btn" + (i === 0 ? " primary" : "");
                b.innerHTML = `<span class="msr">${i === 0 ? "auto_fix_high" : "swap_horiz"}</span>`;
                b.append(document.createTextNode(a.name));
                b.onmousedown = (e) => {
                  e.preventDefault();
                  view.dispatch({ effects: openFix.of(null) });
                  a.apply(view, from, to);
                  view.focus();
                };
                acts.append(b);
              });
              row.append(acts);
            }
            const src = document.createElement("div");
            src.className = "pz-fix-src";
            src.textContent = d.source ?? "";
            row.append(src);
            dom.append(row);
          }
          const foot = document.createElement("div");
          foot.className = "pz-fix-foot";
          foot.textContent = "Esc fecha · Ctrl+. abre de novo";
          dom.append(foot);
          return { dom };
        },
      };
    }),
});

export const quickFix = [
  fixField,
  EditorView.domEventHandlers({
    mouseup(e, view) {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return false;
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
      if (pos == null) return false;
      setTimeout(() => {
        if (!view.state.selection.main.empty) return;
        if (diagnosticsAt(view.state, pos).length) view.dispatch({ effects: openFix.of(pos) });
      }, 0);
      return false;
    },
  }),
  keymap.of([
    {
      key: "Mod-.",
      run: (view) => {
        const pos = view.state.selection.main.head;
        if (!diagnosticsAt(view.state, pos).length) return false;
        view.dispatch({ effects: openFix.of(pos) });
        return true;
      },
    },
    { key: "Escape", run: (view) => (view.state.field(fixField) != null ? (view.dispatch({ effects: openFix.of(null) }), true) : false) },
  ]),
];

export const showFixAt = (view: EditorView, pos: number) => view.dispatch({ effects: openFix.of(pos) });
export const fixOpen = (state: EditorState) => state.field(fixField, false) != null;
