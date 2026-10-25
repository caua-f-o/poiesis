// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
import { useEffect, useImperativeHandle, useRef, forwardRef } from "react";
import { Compartment, EditorSelection, EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  tooltips,
} from "@codemirror/view";
import {
  copyLineDown,
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  moveLineDown,
  moveLineUp,
  selectAll,
  toggleComment,
} from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches, openSearchPanel, selectNextOccurrence } from "@codemirror/search";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, startCompletion } from "@codemirror/autocomplete";
import { bracketMatching, foldGutter, foldKeymap, foldAll, unfoldAll, indentOnInput, indentUnit } from "@codemirror/language";
import { lintGutter, lintKeymap, type Diagnostic } from "@codemirror/lint";
import { json } from "@codemirror/lang-json";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { htmlLanguage } from "@codemirror/lang-html";
import { cssLanguage } from "@codemirror/lang-css";
import { jsonLanguage } from "@codemirror/lang-json";
import { fixesAt, lintExtension, quickFix, requestRelint, setLintFile, showFixAt } from "./lint";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript, javascriptLanguage, scopeCompletionSource } from "@codemirror/lang-javascript";
import {
  abbreviationTracker,
  expandAbbreviation,
  EmmetKnownSyntax,
  balanceOutward,
  removeTag,
  splitJoinTag,
  evaluateMath,
  goToTagPair,
  incrementNumber1,
  decrementNumber1,
  wrapWithAbbreviation,
  emmetConfig,
} from "@emmetio/codemirror6-plugin";
import { colorPicker } from "@replit/codemirror-css-color-picker";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
import { poiesisHighlight, poiesisTheme, structuralTags } from "./theme";
import { autoOpenCompletion, completionSources, langOfKind, setCompletionFile, langAt, type Lang } from "./completions";
import { definitionExtensions, gotoTarget, openDefinition, symbolAt, type Sym } from "./definition";
import { onIndex, type Loc } from "@/lib/indexer";
import type { PFile, Settings } from "@/lib/types";

export interface CursorInfo {
  line: number;
  col: number;
  sel: number;
  lines: number;
}

export type EditorAction =
  | "cut"
  | "copy"
  | "paste"
  | "selectAll"
  | "comment"
  | "duplicate"
  | "lineUp"
  | "lineDown"
  | "selectNext"
  | "upper"
  | "lower"
  | "title"
  | "foldAll"
  | "unfoldAll"
  | "suggest"
  | "emmetWrap"
  | "emmetBalance"
  | "emmetPair"
  | "emmetRemove"
  | "emmetSplit"
  | "emmetMath"
  | "emmetInc"
  | "emmetDec";

export interface MenuContext {
  fixes: { message: string; severity: string; actions: string[] }[];
  icon: string | null;
  sym: Sym | null;
  hasTarget: boolean;
  selection: string;
  lang: Lang;
}

export interface EditorHandle {
  focus(): void;
  goto(line: number, col?: number): void;
  search(): void;
  comment(): void;
  getSelection(): string;
  /** prepara o menu de contexto a partir das coordenadas do clique */
  contextAt(x: number, y: number): MenuContext;
  run(action: EditorAction): Promise<void> | void;
  showDefinition(): void;
  gotoDefinition(): boolean;
  symbolAtCursor(): Sym | null;
  /** aplica a correção j do diagnóstico i do último menu de contexto */
  applyFix(i: number, j: number): void;
  /** abre o cartão de correções no cursor */
  showFixes(): boolean;
  /** linguagem no cursor (HTML embutido em <style>/<script> conta como css/js) */
  langAtCursor(): Lang;
  /** se o cursor está no nome de um ícone dentro de <span class="material-symbols-…"> */
  iconAtCursor(): { from: number; to: number; name: string; style: string } | null;
  /** insere texto no cursor (ou substitui um trecho) e, opcionalmente, um <link> antes de </head> — numa só transação */
  insert(text: string, opts?: { replace?: { from: number; to: number }; headLink?: string }): boolean;
}

interface Props {
  file: PFile | null;
  settings: Settings;
  dark: boolean;
  errorLine: { fileId: string; line: number; col: number; message: string } | null;
  onChange(id: string, content: string): void;
  onCursor(info: CursorInfo): void;
  onRun(): void;
  onJump(loc: Loc): void;
  onOpenFile(f: PFile): void;
  onToast(msg: string): void;
}

const langFor = (file: PFile): Extension[] => {
  switch (file.kind) {
    case "html":
      return [html({ autoCloseTags: true, matchClosingTags: true, selfClosingTags: false })];
    case "css":
      return [css()];
    case "js":
      return [javascript(), javascriptLanguage.data.of({ autocomplete: scopeCompletionSource(globalThis) })];
    case "json":
      return [json()];
    default:
      if (/\.svg$/i.test(file.name)) return [html()];
      if (/\.(md|markdown)$/i.test(file.name))
        return [
          markdown({
            base: markdownLanguage,
            codeLanguages: (info) => {
              const l = info.toLowerCase();
              if (/^(html?|xml|svg)$/.test(l)) return htmlLanguage;
              if (/^(css|scss)$/.test(l)) return cssLanguage;
              if (/^(js|javascript|mjs|ts|typescript|jsx)$/.test(l)) return javascriptLanguage;
              if (l === "json") return jsonLanguage;
              return null;
            },
          }),
          EditorView.contentAttributes.of({ spellcheck: "true", lang: "pt-BR" }),
        ];
      return [EditorView.contentAttributes.of({ spellcheck: "true", lang: "pt-BR" })];
  }
};

/** Nome de ícone sob o cursor dentro de <span class="material-symbols-…">nome</span>. */
function iconAt(v: EditorView): { from: number; to: number; name: string; style: string } | null {
  const head = v.state.selection.main.head;
  const line = v.state.doc.lineAt(head);
  const re = /<[a-zA-Z][\w-]*\b[^<>]*class\s*=\s*["'][^"']*material-symbols-(outlined|rounded|sharp)[^"']*["'][^<>]*>(\s*)([a-z0-9_]*)\s*</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line.text))) {
    const from = line.from + m.index + m[0].indexOf(">", m[0].indexOf("material-symbols")) + 1 + m[2].length;
    const to = from + m[3].length;
    if (head >= from && head <= to) return { from, to, name: m[3], style: m[1] };
  }
  return null;
}

export const CodeEditor = forwardRef<EditorHandle, Props>(function CodeEditor(props, ref) {
  const { file, settings, dark, errorLine } = props;
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const states = useRef(new Map<string, EditorState>());
  const current = useRef<string | null>(null);
  const curId = useRef<string | null>(null);
  const cb = useRef(props);
  cb.current = props;
  const fileRef = useRef(file);
  fileRef.current = file;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const darkRef = useRef(dark);
  darkRef.current = dark;
  const menuFixes = useRef<{ pos: number; list: ReturnType<typeof fixesAt> }>({ pos: 0, list: [] });
  const errorRef = useRef(errorLine);
  errorRef.current = errorLine;
  const runtimeDiags = (state: EditorState): Diagnostic[] => {
    const e = errorRef.current;
    const f = fileRef.current;
    if (!e || !f || e.fileId !== f.id || e.line > state.doc.lines) return [];
    const l = state.doc.line(e.line);
    const from = Math.min(l.from + Math.max(0, e.col - 1), l.to);
    return [{ from: from === l.to ? l.from : from, to: l.to, severity: "error", message: e.message, source: "Preview (erro ao executar)" }];
  };

  const comp = useRef({
    font: new Compartment(),
    wrap: new Compartment(),
    tab: new Compartment(),
    emmet: new Compartment(),
    dark: new Compartment(),
  });

  const fileLang = (): Lang => (fileRef.current ? langOfKind(fileRef.current.kind, fileRef.current.name) : "other");

  const def = useRef(
    definitionExtensions({
      file: () => fileRef.current,
      lang: fileLang,
      jump: (l) => cb.current.onJump(l),
      open: (f) => cb.current.onOpenFile(f),
      hover: () => settingsRef.current.hoverDocs,
    })
  );

  const settingExt = (s: Settings, f: PFile, isDark: boolean) => {
    const syntax = f.kind === "css" ? EmmetKnownSyntax.css : f.kind === "html" || /\.svg$/i.test(f.name) ? EmmetKnownSyntax.html : null;
    return {
      font: EditorView.theme({ ".cm-scroller": { fontSize: s.fontSize + "px" } }),
      wrap: s.wrap ? EditorView.lineWrapping : [],
      tab: [EditorState.tabSize.of(s.tabSize), indentUnit.of(" ".repeat(s.tabSize))],
      emmet:
        s.emmet && syntax
          ? [emmetConfig.of({ completionBoost: -30 }), abbreviationTracker({ syntax }), wrapWithAbbreviation("Ctrl-Shift-a"), keymap.of([{ key: "Mod-e", run: expandAbbreviation }])]
          : [],
      dark: EditorView.darkTheme.of(isDark),
    };
  };

  const reconfig = (f: PFile) => {
    const se = settingExt(settingsRef.current, f, darkRef.current);
    const c = comp.current;
    return [
      c.font.reconfigure(se.font),
      c.wrap.reconfigure(se.wrap),
      c.tab.reconfigure(se.tab),
      c.emmet.reconfigure(se.emmet),
      c.dark.reconfigure(se.dark),
    ];
  };

  const createState = (f: PFile) => {
    const c = comp.current;
    const se = settingExt(settingsRef.current, f, darkRef.current);
    return EditorState.create({
      doc: f.content,
      extensions: [
        c.emmet.of(se.emmet),
        def.current.extensions,
        tooltips({ parent: document.body, position: "fixed" }),
        lineNumbers(),
        highlightActiveLineGutter(),
        foldGutter({
          markerDOM: (open) => {
            const s = document.createElement("span");
            s.className = "msr";
            s.style.fontSize = "16px";
            s.style.verticalAlign = "-3px";
            s.textContent = open ? "keyboard_arrow_down" : "chevron_right";
            return s;
          },
        }),
        lintGutter(),
        lintExtension(() => (f.kind === "html" || /\.svg$/i.test(f.name) ? "html" : f.kind), runtimeDiags),
        quickFix,
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion({
          icons: true,
          activateOnTypingDelay: 40,
          maxRenderedOptions: 120,
          override: completionSources(() => langOfKind(f.kind, f.name)),
          addToOptions: [],
        }),
        autoOpenCompletion,
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches({ minSelectionLength: 2 }),
        indentationMarkers({
          highlightActiveBlock: true,
          markerType: "codeOnly",
          colors: {
            light: "color-mix(in oklab, var(--syn-fg) 10%, transparent)",
            dark: "color-mix(in oklab, var(--syn-fg) 9%, transparent)",
            activeLight: "color-mix(in oklab, var(--syn-cursor) 45%, transparent)",
            activeDark: "color-mix(in oklab, var(--syn-cursor) 40%, transparent)",
          },
        }),
        f.kind === "css" || f.kind === "html" ? colorPicker : [],
        f.kind === "html" || f.kind === "css" ? structuralTags : [],
        keymap.of([
          { key: "Mod-Enter", run: () => (cb.current.onRun(), true) },
          { key: "Mod-s", run: () => (cb.current.onRun(), true), preventDefault: true },
          { key: "Mod-i", run: startCompletion },
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          ...lintKeymap,
          indentWithTab,
        ]),
        poiesisTheme,
        poiesisHighlight,
        c.font.of(se.font),
        c.wrap.of(se.wrap),
        c.tab.of(se.tab),
        c.dark.of(se.dark),
        ...langFor(f),
        EditorView.updateListener.of((u) => {
          const id = curId.current;
          if (!id) return;
          if (u.docChanged) cb.current.onChange(id, u.state.doc.toString());
          if (u.docChanged || u.selectionSet) {
            const r = u.state.selection.main;
            const line = u.state.doc.lineAt(r.head);
            cb.current.onCursor({ line: line.number, col: r.head - line.from + 1, sel: Math.abs(r.to - r.from), lines: u.state.doc.lines });
          }
        }),
      ],
    });
  };

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({ parent: host.current, state: EditorState.create({ doc: "" }) });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
  }, []);

  // troca de arquivo / sincroniza conteúdo externo
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    setCompletionFile(file && file.kind !== "asset" ? file : null);
    setLintFile(file && file.kind !== "asset" ? file : null);
    if (!file || file.kind === "asset") {
      if (current.current) states.current.set(current.current, v.state);
      current.current = null;
      curId.current = null;
      v.setState(EditorState.create({ doc: "" }));
      return;
    }
    const key = file.id + "|" + file.name;
    if (current.current !== key) {
      if (current.current) states.current.set(current.current, v.state);
      let st = states.current.get(key);
      if (!st) st = createState(file);
      else st = st.update({ effects: reconfig(file) }).state;
      current.current = key;
      curId.current = file.id;
      v.setState(st);
      const r = st.selection.main;
      const line = st.doc.lineAt(r.head);
      cb.current.onCursor({ line: line.number, col: r.head - line.from + 1, sel: 0, lines: st.doc.lines });
      requestAnimationFrame(() => v.focus());
    }
    const doc = v.state.doc.toString();
    if (doc !== file.content) {
      const head = Math.min(v.state.selection.main.head, file.content.length);
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: file.content }, selection: EditorSelection.cursor(head) });
    }
  }, [file?.id, file?.name, file?.content]); // eslint-disable-line react-hooks/exhaustive-deps

  // configurações / tema
  useEffect(() => {
    const v = view.current;
    if (!v || !file || file.kind === "asset") return;
    v.dispatch({ effects: reconfig(file) });
  }, [settings.fontSize, settings.wrap, settings.tabSize, settings.emmet, dark]); // eslint-disable-line react-hooks/exhaustive-deps

  // o índice do projeto mudou (arquivos novos, ids, variáveis…) → verifica de novo
  useEffect(() => {
    const off = onIndex(() => {
      const v = view.current;
      if (v && curId.current) requestRelint(v);
    });
    return () => {
      off();
    };
  }, []);

  // erro em tempo de execução → entra junto com a verificação
  useEffect(() => {
    const v = view.current;
    if (v && file && file.kind !== "asset") requestRelint(v);
  }, [errorLine, file?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const transformCase = (fn: (s: string) => string) => {
    const v = view.current;
    if (!v) return;
    v.dispatch(
      v.state.changeByRange((r) => {
        let range = r;
        if (r.empty) {
          const w = v.state.wordAt(r.head);
          if (!w) return { range: r };
          range = EditorSelection.range(w.from, w.to);
        }
        const text = fn(v.state.sliceDoc(range.from, range.to));
        return { changes: { from: range.from, to: range.to, insert: text }, range: EditorSelection.range(range.from, range.from + text.length) };
      })
    );
  };

  useImperativeHandle(ref, () => ({
    focus: () => view.current?.focus(),
    goto: (line, col = 1) => {
      const v = view.current;
      if (!v) return;
      const l = v.state.doc.line(Math.max(1, Math.min(line, v.state.doc.lines)));
      const pos = Math.min(l.from + col - 1, l.to);
      v.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }) });
      v.focus();
    },
    search: () => view.current && openSearchPanel(view.current),
    comment: () => view.current && toggleComment(view.current),
    getSelection: () => {
      const v = view.current;
      if (!v) return "";
      const r = v.state.selection.main;
      return v.state.sliceDoc(r.from, r.to);
    },
    contextAt: (x, y) => {
      const v = view.current;
      const lang = fileLang();
      if (!v) return { sym: null, icon: null, fixes: [], hasTarget: false, selection: "", lang };
      const pos = v.posAtCoords({ x, y });
      if (pos != null) {
        const inSel = v.state.selection.ranges.some((r) => pos >= r.from && pos <= r.to && !r.empty);
        if (!inSel) v.dispatch({ selection: { anchor: pos } });
      }
      const head = pos ?? v.state.selection.main.head;
      const sym = symbolAt(v.state, head, lang);
      const r = v.state.selection.main;
      const icon = iconAt(v);
      const found = fixesAt(v.state, head);
      menuFixes.current = { pos: head, list: found };
      const fixes = found.map(({ d }) => ({ message: d.message, severity: d.severity, actions: (d.actions ?? []).map((a) => a.name) }));
      return { fixes, sym: icon ? null : sym, icon: icon?.name ?? null, hasTarget: !!(sym && gotoTarget(sym, fileRef.current)), selection: v.state.sliceDoc(r.from, r.to), lang: langAt(v.state, head, lang) };
    },
    applyFix: (i, j) => {
      const v = view.current;
      const item = menuFixes.current.list[i];
      const a = item?.d.actions?.[j];
      if (!v || !item || !a) return;
      a.apply(v, item.from, item.to);
      v.focus();
    },
    showFixes: () => {
      const v = view.current;
      if (!v) return false;
      const pos = v.state.selection.main.head;
      if (!fixesAt(v.state, pos).length) return false;
      showFixAt(v, pos);
      v.focus();
      return true;
    },
    langAtCursor: () => {
      const v = view.current;
      return v ? langAt(v.state, v.state.selection.main.head, fileLang()) : fileLang();
    },
    iconAtCursor: () => (view.current ? iconAt(view.current) : null),
    insert: (text, opts = {}) => {
      const v = view.current;
      if (!v) return false;
      const r = opts.replace ?? v.state.selection.main;
      const changes: { from: number; to?: number; insert: string }[] = [{ from: r.from, to: r.to, insert: text }];
      if (opts.headLink) {
        const doc = v.state.doc.toString();
        const close = /([ \t]*)<\/head\s*>/i.exec(doc);
        const open = /<head\b[^>]*>/i.exec(doc);
        if (close) changes.push({ from: close.index, insert: `${close[1]}  ${opts.headLink}\n` });
        else if (open) changes.push({ from: open.index + open[0].length, insert: `\n  ${opts.headLink}` });
        else changes.push({ from: 0, insert: opts.headLink + "\n" });
      }
      changes.sort((a, b) => a.from - b.from);
      const set = v.state.changes(changes);
      const end = set.mapPos(r.from, -1) + text.length;
      v.dispatch({ changes: set, selection: { anchor: end }, scrollIntoView: true, userEvent: "input.icon" });
      v.focus();
      return true;
    },
    symbolAtCursor: () => {
      const v = view.current;
      return v ? symbolAt(v.state, v.state.selection.main.head, fileLang()) : null;
    },
    showDefinition: () => {
      const v = view.current;
      if (!v) return;
      v.dispatch({ effects: openDefinition.of(v.state.selection.main.head) });
      v.focus();
    },
    gotoDefinition: () => {
      const v = view.current;
      if (!v) return false;
      const ok = def.current.go(v, v.state.selection.main.head);
      if (!ok) cb.current.onToast("Nenhuma definição encontrada");
      return ok;
    },
    run: async (a) => {
      const v = view.current;
      if (!v) return;
      const sel = () => v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to);
      switch (a) {
        case "copy":
        case "cut": {
          let text = sel();
          if (!text) {
            const l = v.state.doc.lineAt(v.state.selection.main.head);
            text = l.text + "\n";
            if (a === "cut") v.dispatch({ changes: { from: l.from, to: Math.min(l.to + 1, v.state.doc.length) } });
          } else if (a === "cut") v.dispatch(v.state.replaceSelection(""));
          await navigator.clipboard.writeText(text).catch(() => cb.current.onToast("Sem acesso à área de transferência"));
          break;
        }
        case "paste":
          try {
            const t = await navigator.clipboard.readText();
            v.dispatch(v.state.replaceSelection(t));
          } catch {
            cb.current.onToast("O navegador bloqueou a leitura — use Ctrl+V");
          }
          break;
        case "selectAll":
          selectAll(v);
          break;
        case "comment":
          toggleComment(v);
          break;
        case "duplicate":
          copyLineDown(v);
          break;
        case "lineUp":
          moveLineUp(v);
          break;
        case "lineDown":
          moveLineDown(v);
          break;
        case "selectNext":
          selectNextOccurrence(v);
          break;
        case "upper":
          transformCase((s) => s.toUpperCase());
          break;
        case "lower":
          transformCase((s) => s.toLowerCase());
          break;
        case "title":
          transformCase((s) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase()));
          break;
        case "foldAll":
          foldAll(v);
          break;
        case "unfoldAll":
          unfoldAll(v);
          break;
        case "suggest":
          startCompletion(v);
          break;
        case "emmetWrap":
          v.focus();
          v.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA", ctrlKey: true, shiftKey: true, bubbles: true }));
          break;
        case "emmetBalance":
          balanceOutward(v);
          break;
        case "emmetPair":
          goToTagPair(v);
          break;
        case "emmetRemove":
          removeTag(v);
          break;
        case "emmetSplit":
          splitJoinTag(v);
          break;
        case "emmetMath":
          evaluateMath(v);
          break;
        case "emmetInc":
          incrementNumber1(v);
          break;
        case "emmetDec":
          decrementNumber1(v);
          break;
      }
      v.focus();
    },
  }));

  return <div ref={host} className="h-full w-full overflow-hidden" />;
});
