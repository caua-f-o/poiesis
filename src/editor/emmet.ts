// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/* Integração do Emmet com o CodeMirror 6, escrita para o Poiesis.
 * Usa só o núcleo do Emmet (pacote `emmet`, MIT) para expandir abreviações e
 * `@emmetio/math-expression` (MIT) para as contas; o resto — contexto, prévia,
 * envolver, equilibrar, remover/dividir tags, incrementar números — é feito aqui
 * em cima da árvore de sintaxe do próprio CodeMirror. */
import expandAbbreviation, { extract } from "emmet";
import evaluate, { extract as extractMath } from "@emmetio/math-expression";
import { completionStatus, snippet } from "@codemirror/autocomplete";
import { syntaxTree, indentUnit } from "@codemirror/language";
import { EditorSelection, Prec, StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, keymap, showTooltip, type Command, type Tooltip } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { CSS_PROPS, HTML_TAGS, mdnNow } from "@/lib/docs";
import { langAt, type Lang } from "./completions";

type Kind = "markup" | "stylesheet";

/* ---------------- contexto ---------------- */

const BLOCKED_MARKUP = new Set(["OpenTag", "CloseTag", "SelfClosingTag", "IncompleteCloseTag", "MismatchedCloseTag", "Comment", "Attribute", "AttributeValue", "DoctypeDecl", "ProcessingInst"]);

/** Em que tipo de abreviação a posição aceita expandir: marcação, CSS ou nenhum. */
function kindAt(state: EditorState, pos: number, fallback: Lang): Kind | null {
  const lang = langAt(state, pos, fallback);
  if (lang !== "html" && lang !== "css") return null;
  let inBlock = false;
  for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent) {
    if (lang === "html" && BLOCKED_MARKUP.has(n.name)) return null;
    if (lang === "css") {
      if (n.name === "Comment" || n.name === "String") return null;
      if (n.name === "Block") inBlock = true;
    }
  }
  if (lang === "css" && !inBlock) return null;
  return lang === "html" ? "markup" : "stylesheet";
}

const MARKUP_OPERATORS = /[>+^*.#[\]{}()$:!@]/;
let tagSet: Set<string> | null = null;
let tagSetMdn = false;
function isKnownTag(t: string) {
  const mdn = mdnNow();
  if (!tagSet || (mdn && !tagSetMdn)) {
    tagSet = new Set([...Object.keys(HTML_TAGS), ...Object.keys(mdn?.tags ?? {})]);
    tagSetMdn = !!mdn;
  }
  return tagSet.has(t.toLowerCase());
}
function cssProps(): string[] {
  return [...new Set([...Object.keys(CSS_PROPS), ...Object.keys(mdnNow()?.css ?? {})])];
}

/* ---------------- expansão ---------------- */

/** Escapa chaves para o formato de snippet do CodeMirror (`${1:texto}`). */
const escapeText = (s: string) => s.replace(/[{}]/g, "\\$&");
const field = (i: number, placeholder: string) => (placeholder ? `\${${i}:${placeholder.replace(/[{}]/g, "")}}` : `\${${i}}`);

function expand(abbr: string, kind: Kind, text?: string | string[]): string | null {
  try {
    return expandAbbreviation(abbr, {
      type: kind,
      syntax: kind === "stylesheet" ? "css" : "html",
      text,
      options: { "output.field": field, "output.text": escapeText, "output.indent": "\t" },
    });
  } catch {
    return null;
  }
}

/** Texto final sem as marcas de campo — para a prévia. */
export const plain = (snip: string) =>
  snip.replace(/\$\{\d+(?::([^{}]*))?\}/g, (_, p) => p ?? "").replace(/\\([{}])/g, "$1").replace(/\t/g, "  ");

interface Found {
  from: number;
  to: number;
  abbr: string;
  kind: Kind;
  result: string;
}

/** Abreviação que termina no cursor, se fizer sentido expandi-la ali. */
function findAbbreviation(state: EditorState, fallback: Lang, explicit: boolean): Found | null {
  const sel = state.selection;
  if (sel.ranges.length !== 1 || !sel.main.empty) return null;
  const pos = sel.main.head;
  const kind = kindAt(state, pos, fallback);
  if (!kind) return null;
  const line = state.doc.lineAt(pos);
  const col = pos - line.from;
  const ex = extract(line.text, col, { type: kind, lookAhead: true });
  if (!ex || !ex.abbreviation || ex.end < col) return null;
  const abbr = ex.abbreviation;
  const before = line.text.slice(0, ex.start);

  if (kind === "markup") {
    if (/^\d/.test(abbr)) return null;
    if (!explicit) {
      const hasOps = MARKUP_OPERATORS.test(abbr);
      if (!hasOps && !isKnownTag(abbr)) return null;
      // palavra solta no meio de um texto ("texto p") não vira tag; no começo da linha ou depois de ">" vira
      if (!hasOps && !/(^|>)\s*$/.test(before)) return null;
      // "<di" + Tab é uma tag sendo digitada, não abreviação
      if (/<\/?$/.test(before)) return null;
    }
  } else {
    // só na posição de uma propriedade: nada além de espaço desde o último "{" ou ";"
    if (!/(^|[{;])\s*$/.test(before) && !/^\s*$/.test(before)) return null;
    if (!explicit) {
      const word = /^[a-z-]+$/i.test(abbr);
      // nome (ou começo de nome) de propriedade real fica com o autocompletar
      if (word && cssProps().some((p) => p.startsWith(abbr.toLowerCase()))) return null;
    }
  }

  const result = expand(abbr, kind);
  if (!result || plain(result) === abbr) return null;
  if (kind === "stylesheet" && !explicit) {
    // "colr" virar "column-rule: ;" seria um chute; só expande quando sai um valor de verdade
    // ou quando a abreviação já traz um (m10, w100p, d:f…)
    const value = plain(result).split(":").slice(1).join(":").replace(/;\s*$/, "").trim();
    if (!/[\d:!]/.test(abbr) && !value) return null;
  }
  return { from: line.from + ex.start, to: line.from + ex.end, abbr, kind, result };
}

function apply(view: EditorView, f: Found) {
  snippet(f.result)(view, null as never, f.from, f.to);
  return true;
}

/* ---------------- prévia ---------------- */

const dismiss = StateEffect.define<number>();

interface Preview {
  found: Found;
  dismissedAt: number;
}

function previewFor(state: EditorState, fallback: Lang): Found | null {
  const f = findAbbreviation(state, fallback, false);
  if (!f) return null;
  // na marcação, só vale prévia de abreviação com operadores; "div" sozinho não precisa
  if (f.kind === "markup" && !MARKUP_OPERATORS.test(f.abbr)) return null;
  return f;
}

function previewField(fallback: () => Lang) {
  return StateField.define<Preview | null>({
    create: () => null,
    update(v, tr) {
      for (const e of tr.effects) if (e.is(dismiss)) return v ? { ...v, dismissedAt: e.value } : null;
      if (!tr.docChanged && !tr.selection) return v;
      // a prévia só aparece enquanto se digita; mover o cursor esconde
      if (!tr.docChanged) return null;
      const f = previewFor(tr.state, fallback());
      if (!f) return null;
      if (v && v.dismissedAt === f.from) return { found: f, dismissedAt: f.from };
      return { found: f, dismissedAt: -1 };
    },
    provide: (fd) => [
      showTooltip.compute([fd], (s): Tooltip | null => {
        const p = s.field(fd);
        if (!p || p.dismissedAt === p.found.from) return null;
        return {
          pos: p.found.from,
          above: true,
          create: () => {
            const dom = document.createElement("div");
            dom.className = "pz-emmet";
            const code = document.createElement("div");
            code.className = "emmet-preview";
            const lines = plain(p.found.result).split("\n");
            code.textContent = lines.length > 14 ? lines.slice(0, 14).join("\n") + "\n…" : lines.join("\n");
            const hint = document.createElement("div");
            hint.className = "pz-emmet-hint";
            hint.innerHTML = "<b>Emmet</b> · <kbd>Tab</kbd> expande · <kbd>Esc</kbd> ignora";
            dom.append(code, hint);
            return { dom };
          },
        };
      }),
      EditorView.decorations.compute([fd], (s) => {
        const p = s.field(fd);
        if (!p || p.dismissedAt === p.found.from || p.found.from === p.found.to) return Decoration.none;
        return Decoration.set([Decoration.mark({ class: "emmet-abbreviation" }).range(p.found.from, p.found.to)]);
      }),
    ],
  });
}

/* ---------------- envolver com abreviação ---------------- */

const openWrapEffect = StateEffect.define<{ from: number; to: number } | null>();

const wrapField = StateField.define<{ from: number; to: number } | null>({
  create: () => null,
  update(v, tr) {
    for (const e of tr.effects) if (e.is(openWrapEffect)) return e.value;
    if (v && tr.docChanged) return { from: tr.changes.mapPos(v.from, 1), to: tr.changes.mapPos(v.to, -1) };
    return v;
  },
  provide: (fd) =>
    showTooltip.compute([fd], (s): Tooltip | null => {
      const r = s.field(fd);
      if (!r) return null;
      return { pos: r.from, above: true, create: (view) => wrapPrompt(view, r) };
    }),
});

function dedent(text: string): string {
  const lines = text.split("\n");
  const ind = Math.min(...lines.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)![0].length));
  return Number.isFinite(ind) ? lines.map((l) => l.slice(ind)).join("\n") : text;
}

function wrapExpansion(state: EditorState, r: { from: number; to: number }, abbr: string): string | null {
  const text = state.doc.sliceString(r.from, r.to);
  // "*" sem número repete a abreviação para cada linha (ul>li* vira uma lista)
  const payload = /\*(?!\d)/.test(abbr) ? dedent(text).split("\n").map((l) => l.trim()).filter(Boolean) : dedent(text).trim();
  return expand(abbr, "markup", payload);
}

function wrapPrompt(view: EditorView, r: { from: number; to: number }) {
  const dom = document.createElement("div");
  dom.className = "pz-emmet pz-emmet-wrap";
  const label = document.createElement("label");
  label.textContent = "Envolver com abreviação";
  const input = document.createElement("input");
  input.placeholder = "ex.: div.card>p, ul>li*, a[href=#]";
  input.spellcheck = false;
  input.setAttribute("aria-label", "Abreviação Emmet para envolver a seleção");
  const out = document.createElement("div");
  out.className = "emmet-preview";
  const hint = document.createElement("div");
  hint.className = "pz-emmet-hint";
  hint.innerHTML = "<kbd>Enter</kbd> aplica · <kbd>Esc</kbd> cancela";
  dom.append(label, input, out, hint);

  const close = () => {
    view.dispatch({ effects: openWrapEffect.of(null) });
    view.focus();
  };
  const render = () => {
    const res = input.value.trim() ? wrapExpansion(view.state, r, input.value.trim()) : null;
    const lines = res ? plain(res).split("\n") : [];
    out.textContent = res ? (lines.length > 12 ? lines.slice(0, 12).join("\n") + "\n…" : lines.join("\n")) : "";
    out.style.display = res ? "" : "none";
  };
  input.addEventListener("input", render);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cur = view.state.field(wrapField);
      const res = cur && input.value.trim() ? wrapExpansion(view.state, cur, input.value.trim()) : null;
      if (!cur || !res) return;
      view.dispatch({ effects: openWrapEffect.of(null) });
      view.focus();
      snippet(res)(view, null as never, cur.from, cur.to);
    }
  });
  input.addEventListener("blur", () => setTimeout(() => view.state.field(wrapField, false) && document.activeElement !== input && close(), 120));
  render();
  return { dom, mount: () => input.focus() };
}

/* ---------------- árvore: elementos e blocos ---------------- */

function child(n: SyntaxNode, ...names: string[]) {
  for (let c = n.firstChild; c; c = c.nextSibling) if (names.includes(c.name)) return c;
  return null;
}

/** Elemento HTML mais interno que contém a posição. */
function elementAt(state: EditorState, pos: number): SyntaxNode | null {
  for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); n; n = n.parent) if (n.name === "Element") return n;
  for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent) if (n.name === "Element") return n;
  return null;
}

function trimRange(state: EditorState, from: number, to: number) {
  const t = state.doc.sliceString(from, to);
  const a = t.length - t.trimStart().length;
  const b = t.length - t.trimEnd().length;
  return a + b >= t.length ? { from, to } : { from: from + a, to: to - b };
}

/** Faixas candidatas (conteúdo, depois elemento inteiro) de dentro para fora. */
function balanceCandidates(state: EditorState, pos: number) {
  const out: { from: number; to: number }[] = [];
  for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); n; n = n.parent) {
    if (n.name === "Element") {
      const open = child(n, "OpenTag");
      const close = child(n, "CloseTag");
      if (open && close && close.from > open.to) out.push(trimRange(state, open.to, close.from));
      out.push({ from: n.from, to: n.to });
    } else if (n.name === "Block") {
      if (n.to - n.from > 2) out.push(trimRange(state, n.from + 1, n.to - 1));
    } else if (n.name === "RuleSet" || n.name === "AtRule") {
      out.push({ from: n.from, to: n.to });
    } else if (n.name === "Declaration") {
      out.push({ from: n.from, to: n.to });
    }
  }
  return out;
}

export const balanceOutward: Command = (view) => {
  const { state } = view;
  const ranges = state.selection.ranges.map((r) => {
    const c = balanceCandidates(state, r.from).find((c) => c.from <= r.from && c.to >= r.to && (c.from < r.from || c.to > r.to));
    return c ? EditorSelection.range(c.from, c.to) : r;
  });
  view.dispatch({ selection: EditorSelection.create(ranges, state.selection.mainIndex), scrollIntoView: true, userEvent: "select" });
  return true;
};

export const goToTagPair: Command = (view) => {
  const pos = view.state.selection.main.head;
  const el = elementAt(view.state, pos);
  if (!el) return false;
  const open = child(el, "OpenTag");
  const close = child(el, "CloseTag");
  if (!open || !close) return false;
  const target = pos >= open.from && pos <= open.to ? close.from : open.from;
  view.dispatch({ selection: { anchor: target }, scrollIntoView: true, userEvent: "select" });
  return true;
};

export const removeTag: Command = (view) => {
  const { state } = view;
  const el = elementAt(state, state.selection.main.head);
  if (!el) return false;
  const open = child(el, "OpenTag");
  const close = child(el, "CloseTag");
  if (!open || !close) {
    view.dispatch({ changes: { from: el.from, to: el.to }, userEvent: "delete" });
    return true;
  }
  let inner = state.doc.sliceString(open.to, close.from);
  if (inner.includes("\n")) {
    // tira as linhas em branco das pontas e um nível de indentação
    const unit = state.facet(indentUnit);
    const indent = /^[ \t]*/.exec(state.doc.lineAt(el.from).text)![0];
    const lines = inner.replace(/^[ \t]*\n/, "").replace(/\n[ \t]*$/, "").split("\n");
    inner = lines.map((l, i) => (l.startsWith(indent + unit) ? (i === 0 ? "" : indent) + l.slice(indent.length + unit.length) : i === 0 ? l.trimStart() : l)).join("\n");
  }
  view.dispatch({ changes: { from: el.from, to: el.to, insert: inner }, selection: { anchor: el.from }, userEvent: "delete" });
  return true;
};

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

/** `<div></div>` ↔ `<div />`. Elementos vazios por natureza (img, br…) ficam como estão. */
export const splitJoinTag: Command = (view) => {
  const { state } = view;
  const el = elementAt(state, state.selection.main.head);
  if (!el) return false;
  const tag = child(el, "SelfClosingTag", "OpenTag");
  if (!tag) return false;
  const nameNode = child(tag, "TagName");
  const name = nameNode ? state.doc.sliceString(nameNode.from, nameNode.to) : "";
  const text = state.doc.sliceString(tag.from, tag.to);
  const close = child(el, "CloseTag");
  if (!close) {
    // só divide o que foi escrito como "/>" e não é vazio por natureza
    if (!name || VOID.has(name.toLowerCase()) || !/\/>$/.test(text)) return false;
    const opened = text.replace(/\s*\/>$/, ">");
    view.dispatch({ changes: { from: tag.from, to: tag.to, insert: opened + `</${name}>` }, selection: { anchor: tag.from + opened.length }, userEvent: "input" });
    return true;
  }
  const joined = text.replace(/\s*>$/, " />");
  view.dispatch({ changes: { from: el.from, to: el.to, insert: joined }, selection: { anchor: el.from + joined.length }, userEvent: "delete" });
  return true;
};

/* ---------------- números ---------------- */

const fmt = (n: number) => String(Math.round(n * 1e4) / 1e4);

export const evaluateMath: Command = (view) => {
  const { state } = view;
  const changes: { from: number; to: number; insert: string }[] = [];
  for (const r of state.selection.ranges) {
    let from = r.from;
    let to = r.to;
    if (r.empty) {
      const line = state.doc.lineAt(r.head);
      const m = extractMath(line.text, r.head - line.from);
      if (!m) continue;
      from = line.from + m[0];
      to = line.from + m[1];
    }
    let v: number | null = null;
    try {
      v = evaluate(state.doc.sliceString(from, to));
    } catch {
      v = null;
    }
    if (v != null && Number.isFinite(v)) changes.push({ from, to, insert: fmt(v) });
  }
  if (!changes.length) return false;
  view.dispatch({ changes, userEvent: "input" });
  return true;
};

const changeNumber =
  (delta: number): Command =>
  (view) => {
    const { state } = view;
    const changes: { from: number; to: number; insert: string }[] = [];
    for (const r of state.selection.ranges) {
      const line = state.doc.lineAt(r.head);
      const col = r.head - line.from;
      const re = /-?(\d+\.?\d*|\.\d+)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line.text))) {
        let start = m.index;
        // o "-" de "margin-10" é hífen, não sinal
        if (m[0].startsWith("-") && start > 0 && /[\w)]/.test(line.text[start - 1])) start++;
        const end = m.index + m[0].length;
        if (col < start || col > end) continue;
        const raw = line.text.slice(start, end);
        const decimals = (raw.split(".")[1] || "").length;
        const next = (parseFloat(raw) + delta).toFixed(decimals);
        changes.push({ from: line.from + start, to: line.from + end, insert: next });
        break;
      }
    }
    if (!changes.length) return false;
    view.dispatch({ changes, userEvent: "input" });
    return true;
  };
export const incrementNumber = changeNumber(1);
export const decrementNumber = changeNumber(-1);

/* ---------------- comandos e extensão ---------------- */

export function emmetExtension(fallback: () => Lang): Extension {
  const preview = previewField(fallback);
  const expandTab: Command = (view) => {
    const f = findAbbreviation(view.state, fallback(), false);
    if (!f) return false;
    // depois de um Esc na prévia, o Tab volta a ser só Tab para aquela abreviação
    const p = view.state.field(preview, false);
    if (p && p.dismissedAt === f.from) return false;
    return apply(view, f);
  };
  const expandExplicit: Command = (view) => {
    const f = findAbbreviation(view.state, fallback(), true);
    return f ? apply(view, f) : false;
  };
  const dismissPreview: Command = (view) => {
    const p = view.state.field(preview, false);
    if (!p || p.dismissedAt === p.found.from) return false;
    view.dispatch({ effects: dismiss.of(p.found.from) });
    // Se o autocompletar estiver aberto, o Esc segue e fecha ele também. Se não, o Esc é consumido aqui:
    // um Esc "sem dono" faz o CodeMirror soltar o próximo Tab para fora do editor (modo de acessibilidade).
    return completionStatus(view.state) !== "active";
  };
  return [
    preview,
    wrapField,
    Prec.high(
      keymap.of([
        { key: "Tab", run: expandTab },
        { key: "Mod-e", run: expandExplicit },
        { key: "Ctrl-Shift-a", run: openWrap },
        { key: "Escape", run: dismissPreview },
      ])
    ),
  ];
}

/** Abre o campo de "envolver com abreviação" sobre a seleção (ou o elemento sob o cursor). */
export const openWrap: Command = (view) => {
  const { state } = view;
  let { from, to } = state.selection.main;
  if (from === to) {
    const el = elementAt(state, from);
    if (!el) return false;
    from = el.from;
    to = el.to;
  }
  if (!state.field(wrapField, false)) view.dispatch({ effects: StateEffect.appendConfig.of(wrapField) });
  view.dispatch({ effects: openWrapEffect.of({ from, to }) });
  return true;
};
