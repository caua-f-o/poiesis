/** Símbolo sob o cursor → definição (o que é / para que serve), referências no projeto e "ir para definição". */
import { StateEffect, StateField, type EditorState } from "@codemirror/state";
import { EditorView, hoverTooltip, showTooltip, keymap, type Tooltip } from "@codemirror/view";
import { forEachDiagnostic } from "@codemirror/lint";
import { syntaxTree } from "@codemirror/language";
import { getIndex, type Loc } from "@/lib/indexer";
import { dirName, findFile } from "@/lib/files";
import { attrDoc, atDoc, cssPropDoc, ensureMdn, jsDoc, pseudoDoc, renderDoc, tagDoc, type DocInfo } from "./docview";
import { langAt, type Lang } from "./completions";
import type { PFile } from "@/lib/types";

export type SymKind = "tag" | "attr" | "class" | "id" | "cssprop" | "var" | "keyframes" | "pseudo" | "at" | "js" | "path" | "value";

export interface Sym {
  kind: SymKind;
  name: string;
  from: number;
  to: number;
  lang: Lang;
  tag?: string;
  prefix?: string;
}

/* ---------------- detecção ---------------- */

function wordAt(state: EditorState, pos: number, re = /[\w$-]/) {
  const line = state.doc.lineAt(pos);
  let a = pos - line.from,
    b = a;
  const t = line.text;
  while (a > 0 && re.test(t[a - 1])) a--;
  while (b < t.length && re.test(t[b])) b++;
  return a === b ? null : { from: line.from + a, to: line.from + b, text: t.slice(a, b) };
}

export function symbolAt(state: EditorState, pos: number, fileLang: Lang): Sym | null {
  const lang = langAt(state, pos, fileLang);
  const tree = syntaxTree(state);
  let node = tree.resolveInner(pos, 1);
  if (node.from === pos && node.to === pos) node = tree.resolveInner(pos, -1);
  const text = state.sliceDoc(node.from, node.to);
  const sym = (kind: SymKind, name: string, from = node.from, to = node.to, extra: Partial<Sym> = {}): Sym => ({ kind, name, from, to, lang, ...extra });

  if (lang === "html") {
    if (node.name === "TagName") return sym("tag", text.toLowerCase());
    if (node.name === "DoctypeDecl") return sym("tag", "!doctype");
    const tagOf = () => {
      for (let n: typeof node | null = node; n; n = n.parent) {
        if (/^(OpenTag|SelfClosingTag)$/.test(n.name)) {
          const tn = n.getChild("TagName");
          return tn ? state.sliceDoc(tn.from, tn.to).toLowerCase() : undefined;
        }
      }
      return undefined;
    };
    if (node.name === "AttributeName") return sym("attr", text.toLowerCase(), node.from, node.to, { tag: tagOf() });
    if (node.name === "AttributeValue" || node.name === "UnquotedAttributeValue") {
      const attrNode = node.parent?.getChild("AttributeName");
      const attr = attrNode ? state.sliceDoc(attrNode.from, attrNode.to).toLowerCase() : "";
      if (attr === "class") {
        const w = wordAt(state, pos, /[^\s"']/);
        if (w) return sym("class", w.text, w.from, w.to);
      }
      if (attr === "id" || attr === "for") {
        const v = text.replace(/^["']|["']$/g, "");
        return sym("id", v, node.from + (text.startsWith('"') || text.startsWith("'") ? 1 : 0), node.to - (/["']$/.test(text) ? 1 : 0));
      }
      if (/^(href|src|poster|data|action)$/.test(attr)) {
        const v = text.replace(/^["']|["']$/g, "");
        if (v.startsWith("#")) return sym("id", v.slice(1), node.from + 2, node.to - 1);
        return sym("path", v, node.from + 1, node.to - 1);
      }
      return sym("attr", attr, attrNode?.from ?? node.from, attrNode?.to ?? node.to, { tag: tagOf() });
    }
  }

  if (lang === "css") {
    switch (node.name) {
      case "PropertyName":
        return sym("cssprop", text.toLowerCase());
      case "ClassName":
        return sym("class", text);
      case "IdName":
        return sym("id", text);
      case "TagName":
        return sym("tag", text.toLowerCase());
      case "VariableName":
        return sym("var", text);
      case "PseudoClassName":
        return sym("pseudo", (state.sliceDoc(node.from - 2, node.from) === "::" ? "::" : ":") + text);
      case "AtKeyword":
      case "keyword":
        if (text.startsWith("@")) return sym("at", text);
        break;
      case "ValueName": {
        if (getIndex().keyframes.has(text)) return sym("keyframes", text);
        return sym("value", text);
      }
      case "KeyframeName":
        return sym("keyframes", text);
      case "CallLiteral":
      case "ParenthesizedContent":
      case "String": {
        const m = /url\(\s*["']?([^"')]+)/.exec(state.doc.lineAt(pos).text);
        if (m) return sym("path", m[1]);
      }
    }
    const w = wordAt(state, pos);
    if (w?.text.startsWith("--")) return sym("var", w.text, w.from, w.to);
    if (w && getIndex().keyframes.has(w.text)) return sym("keyframes", w.text, w.from, w.to);
  }

  if (lang === "js") {
    if (node.name === "String" || node.name === "TemplateString") {
      const line = state.doc.lineAt(pos);
      const before = line.text.slice(0, pos - line.from);
      if (/(querySelector(?:All)?|closest|matches)\(\s*["'`][^"'`]*$/.test(before)) {
        const w = wordAt(state, pos, /[\w.#-]/);
        const m = w && /([.#])([\w-]+)/.exec(w.text);
        if (w && m) return sym(m[1] === "." ? "class" : "id", m[2], w.from + w.text.indexOf(m[2]), w.from + w.text.indexOf(m[2]) + m[2].length);
      }
      if (/getElementById\(\s*["'`][^"'`]*$/.test(before)) return sym("id", text.slice(1, -1), node.from + 1, node.to - 1);
      if (/classList\.\w+\([^)]*["'`][^"'`]*$/.test(before)) return sym("class", text.slice(1, -1), node.from + 1, node.to - 1);
      if (/(fetch|import)\(\s*["'`][^"'`]*$|from\s+["'][^"']*$/.test(before)) return sym("path", text.slice(1, -1), node.from + 1, node.to - 1);
      return null;
    }
    if (/^(VariableName|VariableDefinition|PropertyName|PropertyDefinition|function|const|let|var|class|async|await|import|export)$/.test(node.name)) {
      let prefix: string | undefined;
      if (node.name === "PropertyName") {
        const prev = state.sliceDoc(Math.max(0, node.from - 40), node.from);
        prefix = /([A-Za-z_$][\w$]*)\s*\.\s*$/.exec(prev)?.[1];
      }
      return sym("js", text, node.from, node.to, { prefix });
    }
  }
  return null;
}

/* ---------------- descrição ---------------- */

export interface Definition {
  info: DocInfo | null;
  sections: { title: string; items: Loc[]; empty?: string }[];
  footer?: string;
}

export function describe(s: Sym, file: PFile | null): Definition | null {
  const ix = getIndex();
  switch (s.kind) {
    case "tag": {
      const count = ix.tags.get(s.name) ?? 0;
      return { info: tagDoc(s.name), sections: [], footer: count ? `Usado ${count}× no projeto` : undefined };
    }
    case "attr":
      return { info: attrDoc(s.name, s.tag), sections: [] };
    case "cssprop":
      return { info: cssPropDoc(s.name), sections: [] };
    case "pseudo":
      return { info: pseudoDoc(s.name), sections: [] };
    case "at":
      return { info: atDoc(s.name), sections: [] };
    case "js": {
      const fn = ix.functions.get(s.name);
      if (fn?.defs.length)
        return { info: { title: s.name, kind: fn.defs[0].extra === "class" ? "Classe do projeto" : "Função do projeto", desc: "" }, sections: [{ title: "Declaração", items: fn.defs }] };
      const d = jsDoc(s.name, s.prefix);
      return d ? { info: d, sections: [] } : null;
    }
    case "class": {
      const e = ix.classes.get(s.name);
      return {
        info: {
          title: "." + s.name,
          kind: "Classe CSS do projeto",
          desc: e?.defs.length
            ? "Uma classe agrupa elementos para receber os mesmos estilos e comportamentos. Estas são as regras que a definem e onde ela aparece."
            : "Classe usada, mas ainda sem nenhuma regra CSS. Crie uma regra ." + s.name + " { … } para estilizá-la.",
        },
        sections: [
          { title: "Definida em (CSS)", items: e?.defs ?? [], empty: "Nenhuma regra CSS ainda." },
          { title: "Usada em", items: e?.uses ?? [], empty: "Nenhum elemento usa esta classe." },
        ],
      };
    }
    case "id": {
      const e = ix.ids.get(s.name);
      return {
        info: { title: "#" + s.name, kind: "ID do projeto", desc: "Identificador único de um elemento: alvo de #id no CSS, getElementById no JS e links âncora." },
        sections: [
          { title: "Elemento", items: e?.defs ?? [], empty: "Nenhum elemento com este id." },
          { title: "Estilos (CSS)", items: e?.styles ?? [] },
          { title: "No JavaScript", items: e?.uses ?? [] },
        ].filter((x) => x.items.length || x.empty),
      };
    }
    case "var": {
      const e = ix.vars.get(s.name);
      return {
        info: { title: s.name, kind: "Variável CSS (custom property)", desc: e?.defs.length ? `Valor: ${e.defs[0].extra}` : "Variável sem definição no projeto — use var(" + s.name + ", fallback) ou declare em :root." },
        sections: [
          { title: "Definida em", items: e?.defs ?? [], empty: "Não definida." },
          { title: "Usos", items: e?.uses ?? [] },
        ],
      };
    }
    case "keyframes": {
      const e = ix.keyframes.get(s.name);
      return {
        info: { title: "@keyframes " + s.name, kind: "Animação do projeto", desc: "Passos de animação usados por animation/animation-name." },
        sections: [
          { title: "Definida em", items: e?.defs ?? [], empty: "Não definida." },
          { title: "Usada em", items: e?.uses ?? [] },
        ],
      };
    }
    case "path": {
      const f = findFile(ix.files, s.name, file ? dirName(file.name) : "");
      return {
        info: { title: s.name, kind: f ? "Arquivo do projeto" : "Caminho", desc: f ? `Aponta para ${f.name}. Ctrl+clique (ou F12) abre o arquivo.` : "Este caminho não existe no projeto." },
        sections: [],
      };
    }
    case "value": {
      const d = cssPropDoc(s.name);
      return d ? { info: d, sections: [] } : null;
    }
  }
}

/** Para onde "Ir para definição" deve levar. */
export function gotoTarget(s: Sym, file: PFile | null): Loc | { open: PFile } | null {
  const ix = getIndex();
  switch (s.kind) {
    case "class": {
      const e = ix.classes.get(s.name);
      if (!e) return null;
      if (s.lang === "css") return e.uses.find((u) => u.fileId !== file?.id) ?? e.uses[0] ?? null;
      return e.defs[0] ?? null;
    }
    case "id": {
      const e = ix.ids.get(s.name);
      if (!e) return null;
      if (s.lang === "html") return e.styles[0] ?? e.uses[0] ?? null;
      return e.defs[0] ?? null;
    }
    case "var":
      return ix.vars.get(s.name)?.defs[0] ?? null;
    case "keyframes":
      return ix.keyframes.get(s.name)?.defs[0] ?? null;
    case "js":
      return ix.functions.get(s.name)?.defs[0] ?? null;
    case "path": {
      const f = findFile(ix.files, s.name, file ? dirName(file.name) : "");
      return f ? { open: f } : null;
    }
  }
  return null;
}

/* ---------------- integração com o CodeMirror ---------------- */

export interface DefHandlers {
  file: () => PFile | null;
  lang: () => Lang;
  jump: (loc: Loc) => void;
  open: (f: PFile) => void;
  hover: () => boolean;
}

export const openDefinition = StateEffect.define<number>();
export const closeDefinition = StateEffect.define<null>();

export function definitionExtensions(h: DefHandlers) {
  const build = (s: Sym, compact: boolean, view?: EditorView) => {
    const d = describe(s, h.file());
    if (!d) return null;
    return renderDoc(d.info, {
      compact,
      sections: d.sections,
      footer: d.footer,
      onJump: (l) => {
        view?.dispatch({ effects: closeDefinition.of(null) });
        h.jump(l);
      },
      onClose: compact ? undefined : () => view?.dispatch({ effects: closeDefinition.of(null) }),
    });
  };

  const field = StateField.define<{ pos: number; sym: Sym } | null>({
    create: () => null,
    update(v, tr) {
      for (const e of tr.effects) {
        if (e.is(openDefinition)) {
          const sym = symbolAt(tr.state, e.value, h.lang());
          return sym ? { pos: sym.from, sym } : null;
        }
        if (e.is(closeDefinition)) return null;
      }
      if (v && tr.docChanged) return null;
      return v;
    },
    provide: (f) =>
      showTooltip.from(f, (v): Tooltip | null =>
        v
          ? {
              pos: v.pos,
              above: false,
              create: (view) => {
                const dom = document.createElement("div");
                dom.className = "pz-def-pinned";
                const card = build(v.sym, false, view);
                if (card) dom.append(card);
                else {
                  const empty = renderDoc({ title: v.sym.name, kind: "Sem definição", desc: "Não encontrei documentação nem referências para isto." }, { onClose: () => view.dispatch({ effects: closeDefinition.of(null) }) });
                  dom.append(empty);
                }
                // MDN chega depois? re-renderiza
                ensureMdn().then(() => {
                  const again = build(v.sym, false, view);
                  if (again && dom.isConnected) dom.replaceChildren(again);
                });
                return { dom };
              },
            }
          : null
      ),
  });

  const hover = hoverTooltip(
    (view, pos) => {
      if (!h.hover()) return null;
      // sobre um erro/aviso, quem fala é a verificação (com a sugestão de correção)
      let flagged = false;
      forEachDiagnostic(view.state, (_d, from, to) => {
        if (pos >= from && pos <= to) flagged = true;
      });
      if (flagged) return null;
      const s = symbolAt(view.state, pos, h.lang());
      if (!s || s.kind === "value") return null;
      if (view.state.field(field)) return null;
      const node = build(s, true, view);
      if (!node) return null;
      return {
        pos: s.from,
        end: s.to,
        above: true,
        create: () => ({ dom: node }),
      };
    },
    { hoverTime: 650 }
  );

  const go = (view: EditorView, pos: number) => {
    const s = symbolAt(view.state, pos, h.lang());
    if (!s) return false;
    const t = gotoTarget(s, h.file());
    if (!t) return false;
    if ("open" in t) h.open(t.open);
    else h.jump(t);
    return true;
  };

  return {
    extensions: [
      field,
      hover,
      keymap.of([
        { key: "Escape", run: (v) => (v.state.field(field) ? (v.dispatch({ effects: closeDefinition.of(null) }), true) : false) },
        { key: "F12", run: (v) => go(v, v.state.selection.main.head) },
        { key: "Mod-F12", run: (v) => (v.dispatch({ effects: openDefinition.of(v.state.selection.main.head) }), true) },
        { key: "Alt-F1", run: (v) => (v.dispatch({ effects: openDefinition.of(v.state.selection.main.head) }), true) },
      ]),
      EditorView.domEventHandlers({
        mousedown: (e, view) => {
          if (!(e.ctrlKey || e.metaKey) || e.button !== 0) return false;
          const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
          if (pos == null) return false;
          if (go(view, pos)) {
            e.preventDefault();
            return true;
          }
          return false;
        },
      }),
    ],
    go,
  };
}
