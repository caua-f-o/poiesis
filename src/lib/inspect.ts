// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/* Inspetor visual: tipos, validação das mensagens vindas do preview (não confiáveis)
 * e o vínculo entre elementos do preview e posições no código-fonte. */
import type { EditorState } from "@codemirror/state";
import { EditorState as ES } from "@codemirror/state";
import { html as htmlLang } from "@codemirror/lang-html";
import { css as cssLang } from "@codemirror/lang-css";
import { ensureSyntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";

export interface PathStep {
  tag: string;
  i: number;
}

export interface BriefNode {
  id: number;
  type: "el" | "text" | "comment";
  tag?: string;
  attrs?: [string, string][];
  text?: string;
  count?: number;
  dynamic?: boolean;
}

export type Decl = [string, string, boolean];

export interface MatchedRule {
  id: number;
  selector: string;
  file: string;
  ctx: string[];
  spec: [number, number, number];
  decls: Decl[];
  disabled: string[];
}

export interface TempChange {
  target: string;
  file: string;
  prop: string;
  old: string;
  value: string;
  /** "rule": declaração de uma regra CSS; "inline": atributo style do elemento */
  kind: "rule" | "inline";
  /** @media/@supports/@layer/@container em volta da regra */
  ctx: string[];
  /** caminho do elemento (inline); null se ele foi criado por script */
  path: PathStep[] | null;
  imp: boolean;
}

export interface NodeInfo {
  node: BriefNode;
  label: string;
  ancestors: { id: number; label: string }[];
  path: PathStep[] | null;
  text: string;
  box: { x: number; y: number; w: number; h: number; margin: number[]; border: number[]; padding: number[] };
  inline: Decl[];
  rules: MatchedRule[];
  skippedSheets: number;
  computed: [string, string][];
  vars: [string, string][];
  forced: string[];
  changes: TempChange[];
}

export type InspectMessage =
  | { ev: "node"; data: NodeInfo }
  | { ev: "children"; data: { id: number; nodes: BriefNode[] } }
  | { ev: "found"; data: { q: string; items: { id: number; label: string; text: string }[] } }
  | { ev: "stopped"; data: Record<string, never> }
  | { ev: "error"; data: { message: string } };

/* ---------------- validação ---------------- */

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const s = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");
const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
const id = (x: unknown) => (typeof x === "number" && Number.isInteger(x) && x >= 0 && x < 1e9 ? x : -1);
const arr = <T>(x: unknown, max: number, f: (v: unknown) => T | null): T[] => (Array.isArray(x) ? x.slice(0, max).map(f).filter((v): v is T => v !== null) : []);
const pair = (max: number) => (v: unknown): [string, string] | null => (Array.isArray(v) && v.length >= 2 ? [s(v[0], 200), s(v[1], max)] : null);
const decl = (v: unknown): Decl | null => (Array.isArray(v) && v.length >= 2 && typeof v[0] === "string" ? [s(v[0], 200), s(v[1], 600), v[2] === true] : null);

function brief(x: unknown): BriefNode | null {
  if (!isObj(x) || id(x.id) < 0) return null;
  const type = x.type === "text" || x.type === "comment" ? x.type : "el";
  if (type !== "el") return { id: id(x.id), type, text: s(x.text, 300) };
  const tag = s(x.tag, 60).toLowerCase();
  if (!/^[a-z][\w.-]*$/.test(tag)) return null;
  return { id: id(x.id), type, tag, attrs: arr(x.attrs, 40, pair(400)), count: Math.max(0, Math.min(1e6, n(x.count))), ...(x.dynamic === true ? { dynamic: true } : {}) };
}

function nodeInfo(x: unknown): NodeInfo | null {
  if (!isObj(x)) return null;
  const node = brief(x.node);
  if (!node || node.type !== "el") return null;
  const box = isObj(x.box) ? x.box : {};
  const four = (v: unknown) => (Array.isArray(v) ? v.slice(0, 4).map(n) : [0, 0, 0, 0]);
  return {
    node,
    label: s(x.label, 200),
    ancestors: arr(x.ancestors, 30, (a) => (isObj(a) && id(a.id) >= 0 ? { id: id(a.id), label: s(a.label, 200) } : null)),
    path: Array.isArray(x.path) ? arr(x.path, 200, (p) => (isObj(p) ? { tag: s(p.tag, 60).toLowerCase(), i: Math.max(0, Math.floor(n(p.i))) } : null)) : null,
    text: s(x.text, 400),
    box: { x: n(box.x), y: n(box.y), w: n(box.w), h: n(box.h), margin: four(box.margin), border: four(box.border), padding: four(box.padding) },
    inline: arr(x.inline, 200, decl),
    rules: arr(x.rules, 100, (r) =>
      isObj(r) && id(r.id) >= 0
        ? {
            id: id(r.id),
            selector: s(r.selector, 600),
            file: s(r.file, 400),
            ctx: arr(r.ctx, 10, (c) => (typeof c === "string" ? c.slice(0, 300) : null)),
            spec: (Array.isArray(r.spec) ? r.spec.slice(0, 3).map(n) : [0, 0, 0]) as [number, number, number],
            decls: arr(r.decls, 200, decl),
            disabled: arr(r.disabled, 200, (d) => (typeof d === "string" ? d.slice(0, 200) : null)),
          }
        : null
    ),
    skippedSheets: n(x.skippedSheets),
    computed: arr(x.computed, 450, pair(400)),
    vars: arr(x.vars, 120, pair(400)),
    forced: arr(x.forced, 5, (f) => (typeof f === "string" ? f.slice(0, 20) : null)),
    changes: arr(x.changes, 120, (c) =>
      isObj(c)
        ? {
            target: s(c.target, 300),
            file: s(c.file, 300),
            prop: s(c.prop, 200),
            old: s(c.old, 400),
            value: s(c.value, 400),
            kind: c.kind === "inline" ? ("inline" as const) : ("rule" as const),
            ctx: arr(c.ctx, 10, (v) => (typeof v === "string" ? v.slice(0, 200) : null)),
            path: Array.isArray(c.path) ? arr(c.path, 200, (p) => (isObj(p) ? { tag: s(p.tag, 60).toLowerCase(), i: Math.max(0, Math.floor(n(p.i))) } : null)) : null,
            imp: c.imp === true,
          }
        : null
    ),
  };
}

export function parseInspect(d: Record<string, unknown>): InspectMessage | null {
  const data = d.data;
  switch (d.ev) {
    case "node": {
      const info = nodeInfo(data);
      return info ? { ev: "node", data: info } : null;
    }
    case "children":
      return isObj(data) && id(data.id) >= 0 ? { ev: "children", data: { id: id(data.id), nodes: arr(data.nodes, 500, brief) } } : null;
    case "found":
      return isObj(data)
        ? { ev: "found", data: { q: s(data.q, 200), items: arr(data.items, 200, (it) => (isObj(it) && id(it.id) >= 0 ? { id: id(it.id), label: s(it.label, 200), text: s(it.text, 120) } : null)) } }
        : null;
    case "stopped":
      return { ev: "stopped", data: {} };
    case "error":
      return { ev: "error", data: { message: isObj(data) ? s(data.message, 300) : "" } };
    default:
      return null;
  }
}

/* ---------------- código ↔ preview ---------------- */

const htmlState = (src: string) => {
  const st = ES.create({ doc: src, extensions: [htmlLang()] });
  ensureSyntaxTree(st, st.doc.length, 2000);
  return st;
};

function tagName(st: EditorState, el: SyntaxNode): string {
  const open = el.getChild("OpenTag") ?? el.getChild("SelfClosingTag");
  const name = open?.getChild("TagName");
  return name ? st.sliceDoc(name.from, name.to).toLowerCase() : "";
}

function elementChildren(el: SyntaxNode | null, top: SyntaxNode): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  for (let c = (el ?? top).firstChild; c; c = c.nextSibling) if (c.name === "Element") out.push(c);
  return out;
}

/** Posição (início da tag de abertura) do elemento do caminho no HTML-fonte, ou null. */
export function pathToSource(src: string, path: PathStep[]): { from: number; to: number } | null {
  const st = htmlState(src);
  const top = ensureSyntaxTree(st, st.doc.length, 2000)?.topNode;
  if (!top) return null;
  let cur: SyntaxNode | null = null;
  for (const step of path) {
    const kids: SyntaxNode[] = elementChildren(cur, top).filter((c) => tagName(st, c) === step.tag);
    const hit: SyntaxNode | undefined = kids[step.i];
    if (hit) {
      cur = hit;
      continue;
    }
    // html/head/body/tbody podem estar implícitos no código: pula o passo
    if (["html", "head", "body", "tbody"].includes(step.tag)) continue;
    return null;
  }
  if (!cur) return null;
  const open = cur.getChild("OpenTag") ?? cur.getChild("SelfClosingTag") ?? cur;
  return { from: open.from, to: open.to };
}

/** Caminho (como o preview conta) do elemento HTML no cursor. */
export function sourceToPath(src: string, pos: number): PathStep[] | null {
  const st = htmlState(src);
  const tree = ensureSyntaxTree(st, st.doc.length, 2000);
  if (!tree) return null;
  let el: SyntaxNode | null = tree.resolveInner(pos, 1);
  while (el && el.name !== "Element") el = el.parent;
  if (!el) return null;
  const out: PathStep[] = [];
  for (let e: SyntaxNode | null = el; e && e.name === "Element"; e = e.parent) {
    const tag = tagName(st, e);
    let i = 0;
    for (let s2 = e.prevSibling; s2; s2 = s2.prevSibling) if (s2.name === "Element" && tagName(st, s2) === tag) i++;
    out.unshift({ tag, i });
  }
  return out;
}

/** Linha/coluna da regra com esse seletor num arquivo CSS (primeira ocorrência equivalente). */
export function ruleInCss(src: string, selector: string): { from: number; to: number } | null {
  const st = ES.create({ doc: src, extensions: [cssLang()] });
  const tree = ensureSyntaxTree(st, st.doc.length, 2000);
  if (!tree) return null;
  const norm = (x: string) => x.replace(/\s+/g, " ").replace(/\s*([>+~,])\s*/g, "$1").trim().toLowerCase();
  const want = norm(selector);
  let found: { from: number; to: number } | null = null;
  tree.iterate({
    enter(node) {
      if (found) return false;
      if (node.name === "RuleSet") {
        const block = node.node.getChild("Block");
        const sel = st.sliceDoc(node.from, block ? block.from : node.to);
        if (norm(sel) === want) found = { from: node.from, to: block ? block.from : node.to };
      }
      return undefined;
    },
  });
  // regra dentro de <style> de um HTML: procura o texto direto
  if (!found) {
    const i = src.indexOf(selector.split(",")[0].trim());
    if (i >= 0) found = { from: i, to: i + selector.length };
  }
  return found;
}

/** CSS das mudanças temporárias, agrupado por alvo, para copiar para o código. */
export function changesToCss(changes: TempChange[]): string {
  const by = new Map<string, TempChange[]>();
  for (const c of changes) {
    const key = c.target.replace(/ \(style\)$/, "");
    by.set(key, [...(by.get(key) ?? []), c]);
  }
  const out: string[] = [];
  for (const [target, list] of by) {
    const file = list[0].file ? ` /* ${list[0].file} */` : list[0].target.endsWith("(style)") ? " /* estilo inline do elemento */" : "";
    out.push(`${target} {${file}\n${list.map((c) => (c.value === "(desligado)" ? `  /* ${c.prop}: ${c.old}; */` : `  ${c.prop}: ${c.value};`)).join("\n")}\n}`);
  }
  return out.join("\n\n");
}

/* ---------------- aplicar mudanças do inspetor no código ----------------
 * Só aplica quando o lugar no código é inequívoco: a regra com o mesmo seletor e o mesmo
 * contexto (@media…) aparece exatamente uma vez; o elemento existe no HTML-fonte. Quando
 * não dá, devolve o motivo — a interface oferece copiar o CSS, nunca finge que gravou. */

const PROP_OK = /^-{0,2}[a-zA-Z][a-zA-Z0-9-]*$/;
const normSel = (x: string) =>
  x
    .replace(/\s+/g, " ")
    .replace(/\s*([>+~,])\s*/g, "$1")
    .replace(/'/g, '"')
    .replace(/\[\s*([\w-]+)\s*([~|^$*]?=)\s*([^\]"]+?)\s*\]/g, '[$1$2"$3"]')
    .trim();
const normCtx = (x: string) => x.replace(/\s+/g, "").replace(/;$/, "").toLowerCase();

function valueProblem(prop: string, value: string): string | null {
  if (!PROP_OK.test(prop)) return `Nome de propriedade inválido: “${prop}”.`;
  if (/[;{}]|\/\*|\*\/|<\/?(style|script)/i.test(value)) return `O valor de ${prop} tem caracteres que quebrariam o CSS (; { } ou comentário).`;
  return null;
}

interface CssEdit {
  ok: boolean;
  text?: string;
  reason?: string;
  /** quantas regras com esse seletor e contexto existem no texto */
  count: number;
}

/** Muda (ou desliga, ou acrescenta) uma declaração na única regra que casa. */
export function editCssRule(css: string, c: Pick<TempChange, "target" | "ctx" | "prop" | "value" | "imp">, base = 0): CssEdit {
  const st = ES.create({ doc: css, extensions: [cssLang()] });
  const tree = ensureSyntaxTree(st, st.doc.length, 2000);
  if (!tree) return { ok: false, count: 0, reason: "Não foi possível ler o CSS." };
  const want = normSel(c.target);
  const wantCtx = c.ctx.map(normCtx);
  const hits: SyntaxNode[] = [];
  tree.iterate({
    enter(node) {
      if (node.name !== "RuleSet") return undefined;
      const block = node.node.getChild("Block");
      if (!block) return false;
      if (normSel(css.slice(node.from, block.from)) !== want) return false;
      const ctx: string[] = [];
      for (let p = node.node.parent; p; p = p.parent) {
        const b = p.getChild("Block");
        if (p.name !== "RuleSet" && b && p.name !== "StyleSheet" && p.name !== "Block") ctx.unshift(normCtx(css.slice(p.from, b.from)));
      }
      if (ctx.length === wantCtx.length && ctx.every((x, i) => x === wantCtx[i])) hits.push(node.node);
      return false;
    },
  });
  if (hits.length !== 1) return { ok: false, count: hits.length, reason: hits.length ? `A regra “${c.target}” aparece ${hits.length} vezes nesse contexto; não dá para saber qual mudar.` : `A regra “${c.target}” não foi encontrada no código (pode ter vindo de @import ou de script).` };
  const block = hits[0].getChild("Block")!;
  const decls = block.getChildren("Declaration");
  const prop = c.prop.toLowerCase();
  const target = [...decls].reverse().find((d) => {
    const n = d.getChild("PropertyName");
    return n && css.slice(n.from, n.to).toLowerCase() === prop;
  });
  const disable = c.value === "(desligado)";
  const val = c.value + (c.imp && !/!important/i.test(c.value) ? " !important" : "");
  if (target) {
    let end = target.to;
    const after = /^\s*;/.exec(css.slice(end));
    if (disable) {
      if (after) end += after[0].length;
      const txt = css.slice(target.from, target.to).trim();
      return { ok: true, count: 1, text: css.slice(0, target.from) + `/* ${txt.replace(/\*\//g, "* /")}; */` + css.slice(end) };
    }
    if (!c.value) {
      if (after) end += after[0].length;
      // apaga a declaração e a quebra de linha que sobra
      let from = target.from;
      const lineStart = css.lastIndexOf("\n", from - 1) + 1;
      if (/^\s*$/.test(css.slice(lineStart, from)) && css[end] === "\n") (from = lineStart), end++;
      return { ok: true, count: 1, text: css.slice(0, from) + css.slice(end) };
    }
    const dtext = css.slice(target.from, target.to);
    const colon = dtext.indexOf(":");
    if (colon < 0) return { ok: false, count: 1, reason: "Declaração ilegível." };
    const ws = /^:\s*/.exec(dtext.slice(colon))![0];
    return { ok: true, count: 1, text: css.slice(0, target.from + colon) + ws + val + css.slice(target.to) };
  }
  if (disable || !c.value) return { ok: true, count: 1, text: css }; // nada a desligar no código
  // acrescenta no fim do bloco, com a indentação das outras declarações
  const last = decls[decls.length - 1];
  const close = block.to - 1; // posição do "}"
  if (last) {
    let at = last.to;
    const semi = /^\s*;/.exec(css.slice(at));
    const lineStart = css.lastIndexOf("\n", last.from - 1) + 1;
    const indent = /^[ \t]*/.exec(css.slice(lineStart))![0];
    const multiline = css.slice(block.from, block.to).includes("\n");
    if (semi) at += semi[0].length;
    const ins = (semi ? "" : ";") + (multiline ? `\n${indent}` : " ") + `${c.prop}: ${val};`;
    return { ok: true, count: 1, text: css.slice(0, at) + ins + css.slice(at) };
  }
  const inner = css.slice(block.from + 1, close);
  const multiline = inner.includes("\n");
  const lineStart = css.lastIndexOf("\n", hits[0].from - 1) + 1;
  const indent = /^[ \t]*/.exec(css.slice(lineStart))![0] + "  ";
  const ins = multiline ? `\n${indent}${c.prop}: ${val};` : ` ${c.prop}: ${val}; `;
  void base;
  return { ok: true, count: 1, text: css.slice(0, block.from + 1) + ins + (multiline ? inner.replace(/^\n?/, "\n") : inner.trim()) + css.slice(close) };
}

/** style="…" de um elemento no HTML-fonte. */
export function editInlineStyle(html: string, path: PathStep[], prop: string, value: string, imp: boolean): { ok: boolean; text?: string; reason?: string } {
  const hit = pathToSource(html, path);
  if (!hit) return { ok: false, reason: "O elemento não foi encontrado no HTML-fonte com segurança." };
  const tag = html.slice(hit.from, hit.to);
  const m = /\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag);
  const cur = m ? (m[2] ?? m[3] ?? "") : "";
  const parts = cur
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const i = x.indexOf(":");
      return i > 0 ? [x.slice(0, i).trim(), x.slice(i + 1).trim()] : null;
    })
    .filter((x): x is string[] => !!x);
  const i = parts.findIndex(([k]) => k.toLowerCase() === prop.toLowerCase());
  const v = value + (imp && !/!important/i.test(value) ? " !important" : "");
  if (!value) {
    if (i >= 0) parts.splice(i, 1);
  } else if (i >= 0) parts[i][1] = v;
  else parts.push([prop, v]);
  const style = parts.map(([k, x]) => `${k}: ${x}`).join("; ").replace(/"/g, "&quot;");
  let next: string;
  if (m) next = parts.length ? tag.slice(0, m.index) + ` style="${style}"` + tag.slice(m.index + m[0].length) : tag.slice(0, m.index) + tag.slice(m.index + m[0].length);
  else if (!parts.length) next = tag;
  else next = tag.replace(/\s*(\/?>)$/, ` style="${style}"$1`);
  return { ok: true, text: html.slice(0, hit.from) + next + html.slice(hit.to) };
}

export interface ApplyOutcome {
  /** arquivo → conteúdo novo */
  updates: Record<string, string>;
  applied: TempChange[];
  failed: { change: TempChange; reason: string }[];
}

/** Aplica as mudanças temporárias no código, uma a uma, só onde o lugar é inequívoco. */
export function applyChanges(files: { name: string; content: string; kind: string }[], pageName: string | null, changes: TempChange[]): ApplyOutcome {
  const out: ApplyOutcome = { updates: {}, applied: [], failed: [] };
  const text = (name: string) => out.updates[name] ?? files.find((f) => f.name === name)?.content;
  for (const c of changes) {
    const bad = valueProblem(c.prop, c.value === "(desligado)" ? "" : c.value);
    if (bad) {
      out.failed.push({ change: c, reason: bad });
      continue;
    }
    if (c.kind === "inline") {
      if (!c.path || !pageName) {
        out.failed.push({ change: c, reason: "O elemento foi criado por script: não existe no HTML-fonte." });
        continue;
      }
      if (c.value === "(desligado)") continue;
      const src = text(pageName);
      if (src == null) {
        out.failed.push({ change: c, reason: `${pageName} não está no projeto.` });
        continue;
      }
      const r = editInlineStyle(src, c.path, c.prop, c.value, c.imp);
      if (r.ok) (out.updates[pageName] = r.text!), out.applied.push(c);
      else out.failed.push({ change: c, reason: r.reason! });
      continue;
    }
    const file = files.find((f) => f.name === c.file);
    if (!file) {
      out.failed.push({ change: c, reason: c.file ? `“${c.file}” não é um arquivo do projeto (folha externa).` : "A folha de estilo não tem arquivo no projeto." });
      continue;
    }
    const src = text(file.name)!;
    if (file.kind === "css") {
      const r = editCssRule(src, c);
      if (r.ok) (out.updates[file.name] = r.text!), out.applied.push(c);
      else out.failed.push({ change: c, reason: r.reason! });
      continue;
    }
    if (file.kind === "html") {
      // regras em <style> dentro do HTML: o seletor precisa aparecer uma vez só, somando os blocos
      const blocks = [...src.matchAll(/(<style\b[^>]*>)([\s\S]*?)<\/style\s*>/gi)];
      let total = 0;
      let done: { from: number; to: number; text: string } | null = null;
      for (const b of blocks) {
        const from = b.index! + b[1].length;
        const r = editCssRule(b[2], c);
        total += r.count;
        if (r.ok && r.count === 1) done = { from, to: from + b[2].length, text: r.text! };
      }
      if (total === 1 && done) {
        out.updates[file.name] = src.slice(0, done.from) + done.text + src.slice(done.to);
        out.applied.push(c);
      } else out.failed.push({ change: c, reason: total > 1 ? `A regra “${c.target}” aparece ${total} vezes em ${file.name}.` : `A regra “${c.target}” não foi encontrada nos <style> de ${file.name}.` });
      continue;
    }
    out.failed.push({ change: c, reason: `“${file.name}” não é CSS nem HTML.` });
  }
  return out;
}
