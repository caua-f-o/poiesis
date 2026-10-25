// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
import { EditorView, Decoration, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import { tags as t } from "@lezer/highlight";

/** Todas as cores vêm de variáveis CSS (--syn-*), então trocar de tema é só trocar variáveis. */
const v = (name: string) => `var(--syn-${name})`;

export const poiesisTheme = EditorView.theme({
  "&": { color: v("fg"), backgroundColor: v("bg"), height: "100%" },
  ".cm-scroller": { fontFamily: "var(--font-code)", lineHeight: "1.65", overflow: "auto" },
  ".cm-content": { caretColor: v("cursor"), padding: "10px 0 40vh" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: v("cursor"), borderLeftWidth: "2px" },

  /* Seleção: a camada de seleção fica ATRÁS do texto, então nada por cima dela pode ser opaco.
     A linha ativa usa cor translúcida e a seleção tem contraste próprio com e sem foco. */
  ".cm-selectionBackground": { backgroundColor: v("selection-blur") + " !important" },
  "&.cm-focused .cm-selectionBackground": { backgroundColor: v("selection") + " !important" },
  ".cm-content ::selection": { backgroundColor: "transparent !important" },
  ".cm-selectionLayer": { zIndex: "0 !important" },
  ".cm-activeLine": { backgroundColor: v("active-line") },
  ".cm-selectionMatch": {
    backgroundColor: "color-mix(in oklab, var(--syn-selection) 45%, transparent)",
    borderRadius: "2px",
  },
  "&.cm-focused .cm-matchingBracket": {
    backgroundColor: "color-mix(in oklab, var(--syn-cursor) 18%, transparent)",
    outline: "1px solid color-mix(in oklab, var(--syn-cursor) 55%, transparent)",
    color: "inherit",
  },
  "&.cm-focused .cm-nonmatchingBracket": { outline: "1px solid " + v("invalid") },

  ".cm-gutters": { backgroundColor: v("bg"), color: v("gutter"), border: "none", paddingRight: "6px" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 14px", minWidth: "44px", fontVariantNumeric: "tabular-nums" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: v("cursor") },
  ".cm-foldGutter .cm-gutterElement": { color: v("gutter"), cursor: "pointer" },
  ".cm-foldGutter .cm-gutterElement:hover": { color: v("fg") },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--md-surface-container-high)",
    border: "none",
    color: "var(--md-on-surface-variant)",
    padding: "0 8px",
    borderRadius: "999px",
  },

  ".cm-tooltip": {
    backgroundColor: "var(--md-surface-container)",
    color: "var(--md-on-surface)",
    border: "none",
    borderRadius: "12px",
    boxShadow: "var(--md-elev-2)",
    overflow: "hidden",
  },
  ".cm-tooltip.cm-tooltip-autocomplete": { overflow: "visible" },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": { borderRadius: "12px", fontFamily: "var(--font-code)", fontSize: "12.5px", maxHeight: "300px", padding: "4px" },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": { padding: "3px 10px 3px 6px", lineHeight: "1.55", borderRadius: "8px" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "var(--md-secondary-container)", color: "var(--md-on-secondary-container)" },
  ".cm-completionLabel": { color: "inherit" },
  ".cm-completionMatchedText": { textDecoration: "none", color: "var(--md-primary)", fontWeight: "700" },
  ".cm-completionDetail": { color: "var(--md-on-surface-variant)", fontStyle: "normal", marginLeft: "12px", fontFamily: "var(--font-ui)", fontSize: "11px" },
  ".cm-completionIcon": { opacity: ".85", width: "1.3em", paddingRight: "8px" },
  ".cm-tooltip.cm-completionInfo": {
    padding: "0",
    maxWidth: "380px",
    fontFamily: "var(--font-ui)",
    marginLeft: "6px",
    marginTop: "0",
  },

  ".cm-panels": { backgroundColor: "var(--md-surface-container)", color: "var(--md-on-surface)" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--md-outline-variant)" },
  ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--md-outline-variant)" },
  ".cm-search": { padding: "10px 12px", fontFamily: "var(--font-ui)", fontSize: "12px", display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" },
  ".cm-search label": { display: "inline-flex", alignItems: "center", gap: "4px", color: "var(--md-on-surface-variant)" },
  ".cm-search br": { flexBasis: "100%", height: 0 },
  ".cm-textfield": {
    backgroundColor: "transparent",
    border: "1px solid var(--md-outline)",
    borderRadius: "8px",
    color: "var(--md-on-surface)",
    padding: "5px 10px",
    fontFamily: "var(--font-code)",
    fontSize: "12px",
    outline: "none",
  },
  ".cm-textfield:focus": { borderColor: "var(--md-primary)", boxShadow: "inset 0 0 0 1px var(--md-primary)" },
  ".cm-button": {
    backgroundImage: "none",
    backgroundColor: "var(--md-secondary-container)",
    color: "var(--md-on-secondary-container)",
    border: "none",
    borderRadius: "999px",
    padding: "4px 12px",
    fontFamily: "var(--font-ui)",
    fontWeight: "550",
    cursor: "pointer",
  },
  ".cm-button:hover": { filter: "brightness(1.12)" },
  ".cm-panel.cm-search [name=close]": { color: "var(--md-on-surface-variant)", fontSize: "18px", right: "10px", top: "6px" },
  ".cm-searchMatch": { backgroundColor: "color-mix(in oklab, var(--md-warn) 25%, transparent)", outline: "1px solid color-mix(in oklab, var(--md-warn) 55%, transparent)", borderRadius: "2px" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "color-mix(in oklab, var(--md-warn) 50%, transparent)" },

  ".cm-lintRange-error": { backgroundImage: "none", textDecoration: "underline wavy " + v("invalid"), textDecorationSkipInk: "none", textUnderlineOffset: "3px", cursor: "pointer" },
  ".cm-lintRange-warning": { backgroundImage: "none", textDecoration: "underline wavy var(--md-warn)", textDecorationSkipInk: "none", textUnderlineOffset: "3px", cursor: "pointer" },
  ".cm-lintRange-info": { backgroundImage: "none", textDecoration: "underline dotted var(--md-info)", textUnderlineOffset: "3px", cursor: "pointer" },
  ".cm-lintRange-active": { backgroundColor: "color-mix(in oklab, var(--md-warn) 14%, transparent)" },
  ".cm-tooltip-lint": { padding: "4px 0" },
  ".cm-diagnostic": { padding: "6px 12px 6px 10px", fontFamily: "var(--font-ui)", fontSize: "12.5px", lineHeight: "1.5", maxWidth: "420px", whiteSpace: "normal" },
  ".cm-diagnostic-warning": { borderLeft: "3px solid var(--md-warn)" },
  ".cm-diagnostic-info": { borderLeft: "3px solid var(--md-info)" },
  ".cm-diagnosticSource": { fontSize: "10.5px", color: "var(--md-on-surface-variant)", opacity: ".8" },
  ".cm-diagnosticAction": {
    backgroundColor: "var(--md-secondary-container)",
    color: "var(--md-on-secondary-container)",
    border: "none",
    borderRadius: "999px",
    padding: "2px 10px",
    marginLeft: "0",
    marginRight: "6px",
    marginTop: "6px",
    fontFamily: "var(--font-ui)",
    fontSize: "11.5px",
    fontWeight: "600",
    cursor: "pointer",
  },
  ".cm-lint-marker": { width: "0.8em", height: "0.8em" },
  ".cm-diagnostic-error": { borderLeft: "3px solid " + v("invalid"), padding: "8px 12px" },
  ".cm-gutter-lint": { width: "12px" },
  ".cm-lint-marker-error": { content: "none" },

  ".emmet-abbreviation": { textDecoration: "underline dotted " + v("cursor"), textUnderlineOffset: "3px" },
  ".emmet-preview": { fontFamily: "var(--font-code)", fontSize: "12px", padding: "8px 12px", whiteSpace: "pre", color: v("fg"), maxWidth: "560px", overflow: "hidden", textOverflow: "ellipsis" },
  ".pz-emmet": { padding: "2px 0 0", maxWidth: "580px" },
  ".pz-emmet-hint": { fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--md-on-surface-variant)", padding: "4px 12px 8px", borderTop: "1px solid var(--md-outline-variant)" },
  ".pz-emmet-hint b": { color: v("cursor"), fontWeight: "600" },
  ".pz-emmet-hint kbd": { fontFamily: "var(--font-code)", fontSize: "10.5px", padding: "0 5px", borderRadius: "5px", backgroundColor: "var(--md-surface-container-highest)", color: "var(--md-on-surface)" },
  ".pz-emmet-wrap": { padding: "10px 0 0", minWidth: "320px" },
  ".pz-emmet-wrap label": { display: "block", fontFamily: "var(--font-ui)", fontSize: "11.5px", fontWeight: "600", color: "var(--md-on-surface-variant)", padding: "0 12px 6px" },
  ".pz-emmet-wrap input": {
    display: "block",
    width: "calc(100% - 24px)",
    margin: "0 12px 4px",
    padding: "7px 10px",
    borderRadius: "8px",
    border: "1px solid var(--md-outline)",
    outline: "none",
    backgroundColor: "var(--md-surface-container-lowest)",
    color: "var(--md-on-surface)",
    fontFamily: "var(--font-code)",
    fontSize: "12.5px",
  },
  ".pz-emmet-wrap input:focus": { borderColor: "var(--md-primary)", boxShadow: "0 0 0 1px var(--md-primary)" },
  ".cm-css-color-picker-wrapper": { outline: "1px solid var(--md-outline-variant)", borderRadius: "3px", marginRight: "4px", verticalAlign: "middle" },
  ".cm-def-link": { textDecoration: "underline", textUnderlineOffset: "3px", cursor: "pointer", textDecorationColor: v("cursor") },
});

const style = HighlightStyle.define([
  { tag: t.comment, color: v("comment"), fontStyle: "italic" },
  { tag: [t.keyword, t.modifier, t.operatorKeyword, t.definitionKeyword], color: v("keyword") },
  { tag: [t.controlKeyword, t.moduleKeyword], color: v("control") },
  { tag: [t.tagName], color: v("tag") },
  { tag: [t.angleBracket], color: v("punct") },
  { tag: [t.attributeName], color: v("attr") },
  { tag: [t.attributeValue], color: v("string") },
  { tag: [t.string, t.special(t.string)], color: v("string") },
  { tag: [t.regexp], color: v("regexp") },
  { tag: [t.escape], color: v("escape") },
  { tag: [t.number, t.integer, t.float, t.unit], color: v("number") },
  { tag: [t.bool, t.null, t.atom], color: v("keyword") },
  { tag: [t.self], color: v("control"), fontStyle: "italic" },
  { tag: [t.propertyName], color: v("prop") },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: v("fn") },
  { tag: [t.definition(t.variableName)], color: v("variable") },
  { tag: [t.function(t.definition(t.variableName)), t.definition(t.function(t.variableName))], color: v("def") },
  { tag: [t.definition(t.propertyName)], color: v("prop") },
  { tag: [t.className, t.typeName, t.namespace], color: v("type") },
  { tag: [t.variableName], color: v("variable") },
  { tag: [t.special(t.variableName)], color: v("value") },
  { tag: [t.labelName], color: v("def") },
  { tag: [t.operator, t.derefOperator], color: v("op") },
  { tag: [t.punctuation, t.separator, t.bracket, t.paren, t.brace, t.squareBracket], color: v("punct") },
  { tag: [t.meta, t.documentMeta, t.processingInstruction], color: v("meta") },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: v("value") },
  { tag: [t.heading1], color: v("def"), fontWeight: "700", fontSize: "1.18em" },
  { tag: [t.heading2], color: v("def"), fontWeight: "700", fontSize: "1.1em" },
  { tag: [t.heading], color: v("def"), fontWeight: "600" },
  { tag: [t.monospace], color: v("string") },
  { tag: [t.quote], color: v("comment"), fontStyle: "italic" },
  { tag: [t.list], color: v("keyword") },
  { tag: [t.strikethrough], textDecoration: "line-through" },
  { tag: [t.contentSeparator], color: v("punct") },
  { tag: [t.link, t.url], color: v("fn"), textDecoration: "underline" },
  { tag: [t.emphasis], fontStyle: "italic" },
  { tag: [t.strong], fontWeight: "700" },
  { tag: [t.invalid], color: v("invalid") },
]);

export const poiesisHighlight = syntaxHighlighting(style);

/* ---------------- categorias de tags ---------------- */

const DOC = new Set(["html", "head", "body", "!doctype"]);
const META = new Set(["meta", "link", "title", "style", "script", "base", "noscript", "template"]);
const SECTION = new Set(["header", "nav", "main", "section", "article", "aside", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "hgroup", "address", "search"]);

export function tagCategory(name: string): "doc" | "meta" | "section" | "custom" | null {
  const n = name.toLowerCase();
  if (DOC.has(n)) return "doc";
  if (META.has(n)) return "meta";
  if (SECTION.has(n)) return "section";
  if (n.includes("-")) return "custom";
  return null;
}

const marks = {
  doc: Decoration.mark({ class: "cm-tag-doc" }),
  docPunct: Decoration.mark({ class: "cm-tag-doc-punct" }),
  meta: Decoration.mark({ class: "cm-tag-meta" }),
  section: Decoration.mark({ class: "cm-tag-section" }),
  custom: Decoration.mark({ class: "cm-tag-custom" }),
};
const lineMarks = {
  head: Decoration.line({ class: "cm-head-region" }),
  body: Decoration.line({ class: "cm-body-region" }),
  doc: Decoration.line({ class: "cm-doc-region" }),
};

function buildTagDecos(view: EditorView): DecorationSet {
  const tree = syntaxTree(view.state);
  const doc = view.state.doc;
  const ranges: { from: number; to: number; deco: Decoration }[] = [];
  let headFrom = -1,
    headTo = -1,
    bodyFrom = -1,
    bodyTo = -1;

  tree.iterate({
    enter: (node) => {
      // HTML: <html>, <head>, <body>… / CSS: seletores de tipo
      if (node.name === "TagName") {
        const name = doc.sliceString(node.from, node.to);
        const cat = tagCategory(name);
        if (!cat) return;
        ranges.push({ from: node.from, to: node.to, deco: marks[cat] });
        const parent = node.node.parent;
        if (cat === "doc" && parent && /Tag$/.test(parent.name)) {
          // pinta também os "<", "</" e ">" das tags estruturais
          for (let c = parent.firstChild; c; c = c.nextSibling) {
            if (/^(StartTag|StartCloseTag|EndTag|SelfCloseEndTag)$/.test(c.name)) ranges.push({ from: c.from, to: c.to, deco: marks.docPunct });
          }
          const lower = name.toLowerCase();
          const elem = parent.parent;
          if (elem && elem.name === "Element" && parent.name === "OpenTag") {
            if (lower === "head") (headFrom = elem.from), (headTo = elem.to);
            if (lower === "body") (bodyFrom = elem.from), (bodyTo = elem.to);
          }
        }
      } else if (node.name === "DoctypeDecl") {
        ranges.push({ from: node.from, to: node.to, deco: marks.doc });
      }
    },
  });

  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  const lines: { pos: number; deco: Decoration }[] = [];
  const addRegion = (from: number, to: number, deco: Decoration) => {
    if (from < 0) return;
    const a = doc.lineAt(from).number;
    const b = doc.lineAt(Math.min(to, doc.length)).number;
    for (let l = a; l <= b; l++) lines.push({ pos: doc.line(l).from, deco });
  };
  addRegion(headFrom, headTo, lineMarks.head);
  addRegion(bodyFrom, bodyTo, lineMarks.body);

  // RangeSetBuilder exige ordem; linhas (from=to) e marcas misturadas
  const all = [
    ...lines.map((l) => ({ from: l.pos, to: l.pos, deco: l.deco, line: true })),
    ...ranges.map((r) => ({ ...r, line: false })),
  ].sort((a, b) => a.from - b.from || (a.line === b.line ? a.to - b.to : a.line ? -1 : 1));
  const builder = new RangeSetBuilder<Decoration>();
  let lastLine = -1;
  for (const r of all) {
    if (r.line) {
      if (r.from === lastLine) continue;
      lastLine = r.from;
    }
    builder.add(r.from, r.to, r.deco);
  }
  return builder.finish();
}

/** Diferencia <html>/<head>/<body>, metadados, seções e componentes customizados. */
export const structuralTags = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildTagDecos(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) this.decorations = buildTagDecos(u.view);
    }
  },
  { decorations: (p) => p.decorations }
);
