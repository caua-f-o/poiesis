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
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab, toggleComment } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches, openSearchPanel } from "@codemirror/search";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { bracketMatching, foldGutter, foldKeymap, indentOnInput, indentUnit } from "@codemirror/language";
import { lintGutter, setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript, javascriptLanguage, scopeCompletionSource } from "@codemirror/lang-javascript";
import { abbreviationTracker, expandAbbreviation, EmmetKnownSyntax } from "@emmetio/codemirror6-plugin";
import { colorPicker } from "@replit/codemirror-css-color-picker";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
import { poiesisHighlight, poiesisTheme } from "./theme";
import type { PFile, Settings } from "@/lib/types";

export interface CursorInfo {
  line: number;
  col: number;
  sel: number;
  lines: number;
}

export interface EditorHandle {
  focus(): void;
  goto(line: number, col?: number): void;
  search(): void;
  comment(): void;
  getSelection(): string;
}

interface Props {
  file: PFile | null;
  settings: Settings;
  errorLine: { fileId: string; line: number; col: number; message: string } | null;
  onChange(id: string, content: string): void;
  onCursor(info: CursorInfo): void;
  onRun(): void;
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
      return [javascript()];
    default:
      return /\.svg$/i.test(file.name) ? [html()] : [];
  }
};

export const CodeEditor = forwardRef<EditorHandle, Props>(function CodeEditor(
  { file, settings, errorLine, onChange, onCursor, onRun },
  ref
) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const states = useRef(new Map<string, EditorState>());
  const current = useRef<string | null>(null);
  const cb = useRef({ onChange, onCursor, onRun });
  cb.current = { onChange, onCursor, onRun };

  const comp = useRef({
    font: new Compartment(),
    wrap: new Compartment(),
    tab: new Compartment(),
    emmet: new Compartment(),
  });

  const settingExt = (s: Settings, f: PFile) => {
    const syntax = f.kind === "css" ? EmmetKnownSyntax.css : f.kind === "html" || /\.svg$/i.test(f.name) ? EmmetKnownSyntax.html : null;
    return {
      font: EditorView.theme({ ".cm-scroller": { fontSize: s.fontSize + "px" } }),
      wrap: s.wrap ? EditorView.lineWrapping : [],
      tab: [EditorState.tabSize.of(s.tabSize), indentUnit.of(" ".repeat(s.tabSize))],
      emmet:
        s.emmet && syntax
          ? [abbreviationTracker({ syntax }), keymap.of([{ key: "Mod-e", run: expandAbbreviation }])]
          : [],
    };
  };

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const createState = (f: PFile) => {
    const c = comp.current;
    const se = settingExt(settingsRef.current, f);
    return EditorState.create({
      doc: f.content,
      extensions: [
        c.emmet.of(se.emmet),
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
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion({ icons: true, activateOnTypingDelay: 60 }),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        indentationMarkers({
          highlightActiveBlock: true,
          markerType: "codeOnly",
          colors: { light: "#2a2a30", dark: "#26262b", activeLight: "#4a4334", activeDark: "#4a4334" },
        }),
        f.kind === "css" || f.kind === "html" ? colorPicker : [],
        keymap.of([
          { key: "Mod-Enter", run: () => (cb.current.onRun(), true) },
          { key: "Mod-s", run: () => (cb.current.onRun(), true), preventDefault: true },
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          indentWithTab,
        ]),
        poiesisTheme,
        poiesisHighlight,
        c.font.of(se.font),
        c.wrap.of(se.wrap),
        c.tab.of(se.tab),
        ...langFor(f),
        EditorView.updateListener.of((u) => {
          const id = current.current;
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

  // monta a view uma vez
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
    if (!file || file.kind === "asset") {
      if (current.current) states.current.set(current.current, v.state);
      current.current = null;
      v.setState(EditorState.create({ doc: "" }));
      return;
    }
    if (current.current !== file.id) {
      if (current.current) states.current.set(current.current, v.state);
      let st = states.current.get(file.id);
      if (!st) st = createState(file);
      else {
        const se = settingExt(settingsRef.current, file);
        const c = comp.current;
        st = st.update({
          effects: [c.font.reconfigure(se.font), c.wrap.reconfigure(se.wrap), c.tab.reconfigure(se.tab), c.emmet.reconfigure(se.emmet)],
        }).state;
      }
      current.current = file.id;
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
  }, [file?.id, file?.content]); // eslint-disable-line react-hooks/exhaustive-deps

  // configurações
  useEffect(() => {
    const v = view.current;
    if (!v || !file || file.kind === "asset") return;
    const se = settingExt(settings, file);
    const c = comp.current;
    v.dispatch({
      effects: [c.font.reconfigure(se.font), c.wrap.reconfigure(se.wrap), c.tab.reconfigure(se.tab), c.emmet.reconfigure(se.emmet)],
    });
  }, [settings.fontSize, settings.wrap, settings.tabSize, settings.emmet]); // eslint-disable-line react-hooks/exhaustive-deps

  // erro em tempo de execução → sublinhado na linha
  useEffect(() => {
    const v = view.current;
    if (!v || !file) return;
    const diags: Diagnostic[] = [];
    if (errorLine && errorLine.fileId === file.id && errorLine.line <= v.state.doc.lines) {
      const l = v.state.doc.line(errorLine.line);
      const from = Math.min(l.from + Math.max(0, errorLine.col - 1), l.to);
      diags.push({ from: from === l.to ? l.from : from, to: l.to, severity: "error", message: errorLine.message, source: "Preview" });
    }
    v.dispatch(setDiagnostics(v.state, diags));
  }, [errorLine, file?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // esquece estados de arquivos removidos
  useEffect(() => {
    return () => states.current.clear();
  }, []);

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
  }));

  return <div ref={host} className="h-full w-full overflow-hidden" />;
});
