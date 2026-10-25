// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/** Busca de documentação (PT primeiro, MDN em inglês como reserva) e renderização em DOM puro,
 *  compartilhada pelo autocompletar, pelo hover e pelo cartão de definição. */
import { CSS_AT, CSS_PROPS, CSS_PSEUDO, HTML_ATTRS, HTML_TAGS, JS_DOCS, TAG_CATEGORY_LABEL, loadMdn, mdnCss, mdnNow, mdnSearch, mdnTag } from "@/lib/docs";
import type { Loc } from "@/lib/indexer";

export interface DocInfo {
  title: string;
  kind: string;
  desc: string;
  example?: string;
  syntax?: string;
  values?: string[];
  link?: string;
  english?: boolean;
  chips?: string[];
}

export function tagDoc(tag: string): DocInfo | null {
  const t = tag.toLowerCase();
  const d = HTML_TAGS[t];
  if (d) return { title: `<${t}>`, kind: "Elemento HTML", desc: d.d, example: d.ex, link: mdnTag(t), chips: [TAG_CATEGORY_LABEL[d.c] ?? d.c] };
  if (t.includes("-")) return { title: `<${t}>`, kind: "Elemento customizado", desc: "Nome com hífen: um Web Component definido via customElements.define(). Sem definição, funciona como um <span> sem significado.", chips: [TAG_CATEGORY_LABEL.custom] };
  const m = mdnNow()?.tags[t];
  if (m) return { title: `<${t}>`, kind: "Elemento HTML", desc: m[0], link: mdnTag(t), english: true };
  return null;
}

export function attrDoc(attr: string, tag?: string): DocInfo | null {
  const a = attr.toLowerCase();
  const key = a.startsWith("data-") ? "data-*" : a.startsWith("aria-") && !HTML_ATTRS[a] ? null : a;
  const d = key ? HTML_ATTRS[key] : null;
  if (d) return { title: a, kind: tag ? `Atributo de <${tag}>` : "Atributo HTML", desc: d[0], example: d[1], link: mdnSearch(`atributo ${a}`) };
  const mdn = mdnNow();
  const m = (tag && mdn?.tags[tag]?.[1]?.[a]) || mdn?.attrs[a];
  if (m) return { title: a, kind: "Atributo HTML", desc: m, english: true, link: mdnSearch(a) };
  if (a.startsWith("aria-")) return { title: a, kind: "Atributo ARIA", desc: "Atributo de acessibilidade: descreve papel, estado ou relação do elemento para tecnologias assistivas.", link: mdnSearch(a) };
  return null;
}

export function cssPropDoc(prop: string): DocInfo | null {
  const p = prop.toLowerCase();
  if (p.startsWith("--")) return null;
  const d = CSS_PROPS[p];
  const m = mdnNow()?.css[p];
  if (d) return { title: p, kind: "Propriedade CSS", desc: d[0], example: d[1], syntax: m?.[1], values: m?.[2], link: mdnCss(p) };
  if (m) return { title: p, kind: "Propriedade CSS", desc: m[0], syntax: m[1], values: m[2], link: mdnCss(p), english: true };
  return null;
}

export function atDoc(name: string): DocInfo | null {
  const n = name.startsWith("@") ? name : "@" + name;
  const d = CSS_AT[n];
  if (d) return { title: n, kind: "Regra @ do CSS", desc: d[0], example: d[1], link: mdnCss(n) };
  const m = mdnNow()?.at[n];
  return m ? { title: n, kind: "Regra @ do CSS", desc: m, english: true, link: mdnCss(n) } : null;
}

export function pseudoDoc(name: string): DocInfo | null {
  const n = name.replace(/\(.*$/, "");
  const d = CSS_PSEUDO[n];
  if (d) return { title: n, kind: n.startsWith("::") ? "Pseudoelemento" : "Pseudoclasse", desc: d[0], link: mdnCss(n) };
  const m = mdnNow()?.pseudo[n];
  return m ? { title: n, kind: "Pseudo-seletor", desc: m, english: true, link: mdnCss(n) } : null;
}

export function jsDoc(name: string, prefix?: string): DocInfo | null {
  const d = (prefix && JS_DOCS[`${prefix}.${name}`]) || JS_DOCS[name];
  if (!d) return null;
  return { title: prefix ? `${prefix}.${name}` : name, kind: "JavaScript / Web API", desc: d[0], example: d[1], link: mdnSearch(name) };
}

/** Garante que o fallback do MDN está carregado (para chamadas assíncronas). */
export const ensureMdn = () => loadMdn();

/* ---------------- DOM ---------------- */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export interface RenderOpts {
  compact?: boolean;
  onJump?: (loc: Loc) => void;
  sections?: { title: string; items: Loc[]; empty?: string }[];
  onClose?: () => void;
  footer?: string;
}

export function renderDoc(info: DocInfo | null, opts: RenderOpts = {}) {
  const root = el("div", "pz-doc" + (opts.compact ? " compact" : ""));
  if (info) {
    const head = el("div", "pz-doc-head");
    head.append(el("code", "pz-doc-title", info.title));
    head.append(el("span", "pz-doc-kind", info.kind));
    if (opts.onClose) {
      const x = el("button", "pz-doc-x msr", "close");
      x.title = "Fechar (Esc)";
      x.onclick = opts.onClose;
      head.append(x);
    }
    root.append(head);
    if (info.chips?.length) {
      const chips = el("div", "pz-doc-chips");
      for (const c of info.chips) chips.append(el("span", "pz-doc-chip", c));
      root.append(chips);
    }
    if (info.desc) root.append(el("p", "pz-doc-desc", info.desc));
    if (!opts.compact && info.syntax) {
      const s = el("div", "pz-doc-syntax");
      s.append(el("span", "pz-doc-label", "Sintaxe"), el("code", undefined, info.syntax));
      root.append(s);
    }
    if (!opts.compact && info.values?.length) {
      const s = el("div", "pz-doc-values");
      for (const v of info.values.slice(0, 12)) s.append(el("code", "pz-doc-chip code", v));
      root.append(s);
    }
    if (info.example) root.append(el("pre", "pz-doc-ex", info.example));
  }
  for (const sec of opts.sections ?? []) {
    const box = el("div", "pz-doc-sec");
    box.append(el("div", "pz-doc-label", `${sec.title}${sec.items.length ? ` · ${sec.items.length}` : ""}`));
    if (!sec.items.length && sec.empty) box.append(el("div", "pz-doc-empty", sec.empty));
    for (const l of sec.items.slice(0, opts.compact ? 3 : 12)) {
      const row = el("button", "pz-doc-ref");
      row.append(el("span", "pz-doc-ref-file", `${l.file.split("/").pop()}:${l.line}`));
      const code = el("pre", "pz-doc-ref-code", l.text.length > 400 ? l.text.slice(0, 400) + "…" : l.text);
      row.append(code);
      row.onclick = (e) => {
        e.preventDefault();
        opts.onJump?.(l);
      };
      box.append(row);
    }
    if (sec.items.length > (opts.compact ? 3 : 12)) box.append(el("div", "pz-doc-empty", `+ ${sec.items.length - (opts.compact ? 3 : 12)} outros`));
    root.append(box);
  }
  const foot = el("div", "pz-doc-foot");
  if (info?.english) foot.append(el("span", "pz-doc-muted", "Descrição: MDN Web Docs, Mozilla Contributors · CC BY-SA 2.5 (em inglês)"));
  if (opts.footer) foot.append(el("span", "pz-doc-muted", opts.footer));
  if (info?.link) {
    const a = el("a", "pz-doc-link", "Abrir no MDN");
    a.href = info.link;
    a.target = "_blank";
    a.rel = "noopener";
    foot.append(a);
  }
  if (foot.childNodes.length) root.append(foot);
  return root;
}
