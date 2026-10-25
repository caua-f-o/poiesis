// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/** Índice do projeto: o que cada arquivo define e usa (classes, ids, variáveis CSS, keyframes, funções).
 *  Alimenta o autocompletar cruzado HTML ↔ CSS ↔ JS, as definições e o "ir para definição". */
import type { PFile } from "./types";

export interface Loc {
  fileId: string;
  file: string;
  line: number;
  col: number;
  from: number;
  to: number;
  /** trecho de contexto (linha ou regra CSS) */
  text: string;
  /** para CSS: seletor completo; para variáveis: valor; para HTML: tag */
  extra?: string;
}

export interface SymbolEntry {
  defs: Loc[]; // onde é estilizado/declarado (CSS para classes, HTML para ids, declaração para funções)
  uses: Loc[]; // onde é usado
}

export interface ProjectIndex {
  files: PFile[];
  classes: Map<string, SymbolEntry>;
  ids: Map<string, SymbolEntry & { styles: Loc[] }>;
  vars: Map<string, SymbolEntry>;
  keyframes: Map<string, SymbolEntry>;
  functions: Map<string, SymbolEntry>;
  tags: Map<string, number>;
  /** atributos data-* (forma kebab, sem o prefixo "data-") */
  dataAttrs: Map<string, SymbolEntry>;
  /** chaves usadas em localStorage/sessionStorage */
  storageKeys: Map<string, SymbolEntry>;
  /** famílias de fonte declaradas (@font-face) ou carregadas (Google Fonts) */
  fonts: Map<string, SymbolEntry>;
}

const empty = (): ProjectIndex => ({
  files: [],
  classes: new Map(),
  ids: new Map(),
  vars: new Map(),
  keyframes: new Map(),
  functions: new Map(),
  tags: new Map(),
  dataAttrs: new Map(),
  storageKeys: new Map(),
  fonts: new Map(),
});

let current: ProjectIndex = empty();
const listeners = new Set<() => void>();
export const getIndex = () => current;
export const onIndex = (fn: () => void) => (listeners.add(fn), () => listeners.delete(fn));

function lineStarts(text: string) {
  const s = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) s.push(i + 1);
  return s;
}
function posToLC(starts: number[], pos: number) {
  let lo = 0,
    hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= pos) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, col: pos - starts[lo] + 1 };
}

/** Apaga comentários mantendo as posições (troca por espaços). */
const blankComments = (s: string, re: RegExp) => s.replace(re, (m) => m.replace(/[^\n]/g, " "));

function entry<K>(map: Map<K, SymbolEntry>, key: K) {
  let e = map.get(key);
  if (!e) map.set(key, (e = { defs: [], uses: [] }));
  return e;
}
function idEntry(map: ProjectIndex["ids"], key: string) {
  let e = map.get(key);
  if (!e) map.set(key, (e = { defs: [], uses: [], styles: [] }));
  return e;
}

function indexCss(ix: ProjectIndex, f: PFile, css: string, base: number, starts: number[], full: string) {
  const text = blankComments(css, /\/\*[\s\S]*?\*\//g);
  const loc = (from: number, to: number, extra?: string): Loc => {
    const { line, col } = posToLC(starts, base + from);
    const lineText = full.slice(starts[line - 1], starts[line] ?? full.length).replace(/\n$/, "");
    return { fileId: f.id, file: f.name, line, col, from: base + from, to: base + to, text: lineText.trim(), extra };
  };

  // regras: seletor { bloco }
  const ruleRe = /([^{}@;]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = ruleRe.exec(text))) {
    const selector = m[1];
    const selStart = m.index + (selector.length - selector.trimStart().length);
    const sel = selector.trim();
    if (!sel || /^(from|to|\d+%)/.test(sel)) continue;
    const block = m[2]
      .trim()
      .split("\n")
      .map((l) => "  " + l.trim())
      .filter((l) => l.trim())
      .slice(0, 8)
      .join("\n");
    const ruleText = `${sel} {\n${block}\n}`;
    const tokRe = /([.#])(-?[_a-zA-Z -￿][\w -￿-]*)/g;
    let t: RegExpExecArray | null;
    // ignora o conteúdo de :not(...) etc.? mantém — ainda é uma referência ao nome
    while ((t = tokRe.exec(selector))) {
      const from = m.index + t.index + 1;
      const l = loc(from, from + t[2].length, sel);
      l.text = ruleText;
      if (t[1] === ".") entry(ix.classes, t[2]).defs.push(l);
      else idEntry(ix.ids, t[2]).styles.push(l);
    }
    void selStart;
  }
  // variáveis
  const varDef = /(--[\w-]+)\s*:\s*([^;}{]+)/g;
  while ((m = varDef.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 4), m.index);
    if (/var\(\s*$/.test(before)) continue;
    entry(ix.vars, m[1]).defs.push(loc(m.index, m.index + m[1].length, m[2].trim()));
  }
  const varUse = /var\(\s*(--[\w-]+)/g;
  while ((m = varUse.exec(text))) {
    const from = m.index + m[0].indexOf("--");
    entry(ix.vars, m[1]).uses.push(loc(from, from + m[1].length));
  }
  // @font-face { font-family: "X" }
  const ff = /@font-face\s*\{[^}]*?font-family\s*:\s*(["']?)([^;"'}]+)\1/g;
  while ((m = ff.exec(text))) {
    const from = m.index + m[0].lastIndexOf(m[2]);
    entry(ix.fonts, m[2].trim()).defs.push(loc(from, from + m[2].length, "@font-face"));
  }
  // keyframes
  const kf = /@keyframes\s+([\w-]+)/g;
  while ((m = kf.exec(text))) {
    const from = m.index + m[0].lastIndexOf(m[1]);
    entry(ix.keyframes, m[1]).defs.push(loc(from, from + m[1].length));
  }
  const anim = /animation(?:-name)?\s*:\s*([^;}]+)/g;
  while ((m = anim.exec(text))) {
    for (const w of m[1].split(/[\s,]+/)) {
      if (!w || /^[\d.]/.test(w)) continue;
      const from = m.index + m[0].indexOf(w, m[0].indexOf(":"));
      entry(ix.keyframes, w).uses.push(loc(from, from + w.length));
    }
  }
}

function indexHtml(ix: ProjectIndex, f: PFile) {
  const src = f.content;
  const starts = lineStarts(src);
  const text = blankComments(src, /<!--[\s\S]*?-->/g);
  const loc = (from: number, to: number, extra?: string): Loc => {
    const { line, col } = posToLC(starts, from);
    const lineText = src.slice(starts[line - 1], starts[line] ?? src.length).replace(/\n$/, "");
    return { fileId: f.id, file: f.name, line, col, from, to, text: lineText.trim(), extra };
  };
  let m: RegExpExecArray | null;
  const tagAt = (pos: number) => {
    const lt = text.lastIndexOf("<", pos);
    const t = /^<([a-zA-Z][\w-]*)/.exec(text.slice(lt, lt + 40));
    return t ? t[1].toLowerCase() : undefined;
  };
  const cls = /\sclass\s*=\s*(["'])([^"']*)\1/g;
  while ((m = cls.exec(text))) {
    const valStart = m.index + m[0].indexOf(m[1]) + 1;
    const tag = tagAt(m.index);
    const wordRe = /[^\s]+/g;
    let w: RegExpExecArray | null;
    while ((w = wordRe.exec(m[2]))) entry(ix.classes, w[0]).uses.push(loc(valStart + w.index, valStart + w.index + w[0].length, tag));
  }
  const ids = /\sid\s*=\s*(["'])([^"']*)\1/g;
  while ((m = ids.exec(text))) {
    const valStart = m.index + m[0].indexOf(m[1]) + 1;
    if (m[2].trim()) idEntry(ix.ids, m[2].trim()).defs.push(loc(valStart, valStart + m[2].length, tagAt(m.index)));
  }
  const data = /\sdata-([\w-]+)\s*(?==|[\s>\/])/g;
  while ((m = data.exec(text))) {
    const from = m.index + m[0].indexOf("data-");
    entry(ix.dataAttrs, m[1].toLowerCase()).defs.push(loc(from, from + 5 + m[1].length, tagAt(m.index)));
  }
  const gf = /fonts\.googleapis\.com\/css2?\?([^"'\s>]+)/g;
  while ((m = gf.exec(text))) {
    for (const fam of m[1].matchAll(/family=([^&:;]+)/g)) {
      const name = decodeURIComponent(fam[1].replace(/\+/g, " "));
      entry(ix.fonts, name).defs.push(loc(m.index, m.index + m[0].length, "Google Fonts"));
    }
  }
  const tags = /<([a-zA-Z][\w-]*)/g;
  while ((m = tags.exec(text))) {
    const t = m[1].toLowerCase();
    ix.tags.set(t, (ix.tags.get(t) ?? 0) + 1);
  }
  // <style> e <script> embutidos
  const style = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  while ((m = style.exec(text))) {
    const base = m.index + m[0].indexOf(">") + 1;
    indexCss(ix, f, src.slice(base, base + m[1].length), base, starts, src);
  }
  const script = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = script.exec(text))) {
    const base = m.index + m[0].indexOf(">") + 1;
    indexJs(ix, f, src.slice(base, base + m[1].length), base, starts, src);
  }
}

function indexJs(ix: ProjectIndex, f: PFile, js: string, base: number, starts: number[], full: string) {
  const text = blankComments(blankComments(js, /\/\*[\s\S]*?\*\//g), /(^|[^:\\])\/\/[^\n]*/g);
  const loc = (from: number, to: number, extra?: string): Loc => {
    const { line, col } = posToLC(starts, base + from);
    const lineText = full.slice(starts[line - 1], starts[line] ?? full.length).replace(/\n$/, "");
    return { fileId: f.id, file: f.name, line, col, from: base + from, to: base + to, text: lineText.trim(), extra };
  };
  let m: RegExpExecArray | null;
  const fnDecl = /\b(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)|\bclass\s+([A-Za-z_$][\w$]*)/g;
  while ((m = fnDecl.exec(text))) {
    const name = m[1] || m[2] || m[3];
    const from = m.index + m[0].indexOf(name);
    entry(ix.functions, name).defs.push(loc(from, from + name.length, m[3] ? "class" : "function"));
  }
  const qs = /\b(querySelector(?:All)?|closest|matches)\(\s*(["'`])([^"'`]*)\2/g;
  while ((m = qs.exec(text))) {
    const valStart = m.index + m[0].indexOf(m[2]) + 1;
    const tokRe = /([.#])(-?[_a-zA-Z][\w-]*)/g;
    let t: RegExpExecArray | null;
    while ((t = tokRe.exec(m[3]))) {
      const from = valStart + t.index + 1;
      const l = loc(from, from + t[2].length);
      if (t[1] === ".") entry(ix.classes, t[2]).uses.push(l);
      else idEntry(ix.ids, t[2]).uses.push(l);
    }
  }
  const byId = /\bgetElementById\(\s*(["'`])([^"'`]*)\1/g;
  while ((m = byId.exec(text))) {
    const from = m.index + m[0].indexOf(m[1]) + 1;
    idEntry(ix.ids, m[2]).uses.push(loc(from, from + m[2].length));
  }
  const cl = /\bclassList\.(?:add|remove|toggle|contains|replace)\(([^)]*)\)/g;
  while ((m = cl.exec(text))) {
    const argStart = m.index + m[0].indexOf("(") + 1;
    const strRe = /(["'`])([\w-]+)\1/g;
    let s: RegExpExecArray | null;
    while ((s = strRe.exec(m[1]))) {
      const from = argStart + s.index + 1;
      entry(ix.classes, s[2]).uses.push(loc(from, from + s[2].length));
    }
  }
  const ds = /\.dataset\.([A-Za-z_$][\w$]*)|\.dataset\[\s*(["'`])([\w-]+)\2\s*\]/g;
  while ((m = ds.exec(text))) {
    const raw = m[1] ?? m[3];
    const kebab = m[1] ? raw.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()) : raw;
    const from = m.index + m[0].indexOf(raw);
    entry(ix.dataAttrs, kebab).uses.push(loc(from, from + raw.length));
  }
  const st = /\b(?:localStorage|sessionStorage)\.(setItem|getItem|removeItem)\(\s*(["'`])([^"'`]+)\2/g;
  while ((m = st.exec(text))) {
    const from = m.index + m[0].indexOf(m[2]) + 1;
    const e = entry(ix.storageKeys, m[3]);
    (m[1] === "setItem" ? e.defs : e.uses).push(loc(from, from + m[3].length));
  }
  const cn = /\bclassName\s*=\s*(["'`])([^"'`]*)\1/g;
  while ((m = cn.exec(text))) {
    const vs = m.index + m[0].indexOf(m[1]) + 1;
    const wordRe = /[\w-]+/g;
    let w: RegExpExecArray | null;
    while ((w = wordRe.exec(m[2]))) entry(ix.classes, w[0]).uses.push(loc(vs + w.index, vs + w.index + w[0].length));
  }
}

export function buildIndex(files: PFile[]): ProjectIndex {
  const ix = empty();
  ix.files = files;
  for (const f of files) {
    try {
      if (f.kind === "html") indexHtml(ix, f);
      else if (f.kind === "css") indexCss(ix, f, f.content, 0, lineStarts(f.content), f.content);
      else if (f.kind === "js") indexJs(ix, f, f.content, 0, lineStarts(f.content), f.content);
    } catch {
      /* um arquivo malformado não derruba o índice */
    }
  }
  return ix;
}

export function setIndex(files: PFile[]) {
  current = buildIndex(files);
  listeners.forEach((l) => l());
}
