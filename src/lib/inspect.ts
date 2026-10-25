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
      isObj(c) ? { target: s(c.target, 300), file: s(c.file, 300), prop: s(c.prop, 200), old: s(c.old, 400), value: s(c.value, 400) } : null
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
