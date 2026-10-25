// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/* Extension Studio: leitura e edição do manifest.json (sem perder campos desconhecidos),
 * posições no texto e os pontos de entrada da extensão. */
import { jsonLanguage } from "@codemirror/lang-json";
import type { SyntaxNode } from "@lezer/common";
import type { PFile } from "../types";

export const MANIFEST = "manifest.json";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Json = any;
export type JPath = (string | number)[];

export const manifestFile = (files: PFile[]) => files.find((f) => f.name === MANIFEST);

/** O projeto é uma extensão quando tem um manifest.json na raiz com manifest_version. */
export function isExtensionProject(files: PFile[]): boolean {
  const f = manifestFile(files);
  return !!f && /"manifest_version"\s*:/.test(f.content);
}

export function parseManifest(src: string): { data: Json | null; error: string | null } {
  try {
    const data = JSON.parse(src);
    if (!data || typeof data !== "object" || Array.isArray(data)) return { data: null, error: "O manifesto precisa ser um objeto JSON ({ … })." };
    return { data, error: null };
  } catch (e) {
    return { data: null, error: "JSON inválido: " + String((e as Error).message).replace(/^JSON\.parse: /, "") };
  }
}

/* ---------------- posições ---------------- */

function valueOf(prop: SyntaxNode): SyntaxNode | null {
  for (let c = prop.firstChild; c; c = c.nextSibling) if (c.name !== "PropertyName" && c.name !== ":") return c;
  return null;
}
const unquote = (s: string) => {
  try {
    return JSON.parse(s);
  } catch {
    return s.slice(1, -1);
  }
};

/** Trecho do texto que corresponde ao caminho (o valor; ou o nome da chave, se `key`). Cai no ancestral mais próximo que existir. */
let treeCache: { src: string; tree: ReturnType<typeof jsonLanguage.parser.parse> } | null = null;

export function jsonRange(src: string, path: JPath, key = false): { from: number; to: number } {
  if (treeCache?.src !== src) treeCache = { src, tree: jsonLanguage.parser.parse(src) };
  const tree = treeCache.tree;
  let node: SyntaxNode | null = tree.topNode.firstChild;
  let best = { from: 0, to: Math.min(src.length, 1) };
  if (node && node.name !== "Object" && node.name !== "Array") return best;
  for (let i = 0; i < path.length && node; i++) {
    const step = path[i];
    let next: SyntaxNode | null = null;
    let keyNode: SyntaxNode | null = null;
    if (node.name === "Object" && typeof step === "string") {
      for (let c = node.firstChild; c; c = c.nextSibling) {
        if (c.name !== "Property") continue;
        const k = c.getChild("PropertyName");
        if (k && unquote(src.slice(k.from, k.to)) === step) {
          keyNode = k;
          next = valueOf(c);
        }
      }
      if (keyNode) best = { from: keyNode.from, to: keyNode.to };
    } else if (node.name === "Array" && typeof step === "number") {
      let n = 0;
      for (let c = node.firstChild; c; c = c.nextSibling) {
        if (c.name === "[" || c.name === "]" || c.name === "," || c.type.isError) continue;
        if (n++ === step) next = c;
      }
    }
    if (!next) return best;
    node = next;
    if (!(key && i === path.length - 1 && keyNode)) best = { from: next.from, to: next.to };
  }
  return best;
}

/* ---------------- edição ---------------- */

function indentOf(src: string): string | number {
  const m = /\n([ \t]+)"/.exec(src);
  if (!m) return 2;
  return m[1].includes("\t") ? "\t" : m[1].length;
}

/** Aplica uma mudança no objeto do manifesto e devolve o texto novo, mantendo a indentação
 *  e todos os campos (inclusive os que o formulário não conhece). */
export function editManifest(src: string, mutate: (m: Json) => void): string | null {
  const { data } = parseManifest(src);
  if (!data) return null;
  mutate(data);
  return JSON.stringify(data, null, indentOf(src)) + "\n";
}

export function getAt(obj: Json, path: JPath): Json {
  let cur = obj;
  for (const k of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[k as keyof typeof cur];
  }
  return cur;
}

/** Define (ou apaga, com undefined) um valor no caminho, criando os objetos do meio.
 *  Objetos que ficam vazios depois de apagar também saem. */
export function setAt(obj: Json, path: JPath, value: Json) {
  const stack: Json[] = [obj];
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    if (cur[k] == null || typeof cur[k] !== "object") {
      if (value === undefined) return;
      cur[k] = typeof path[i + 1] === "number" ? [] : {};
    }
    cur = cur[k];
    stack.push(cur);
  }
  const last = path[path.length - 1];
  if (value === undefined) {
    if (Array.isArray(cur) && typeof last === "number") cur.splice(last, 1);
    else delete cur[last];
    for (let i = path.length - 2; i >= 0; i--) {
      const parent = stack[i];
      const child = parent[path[i]];
      const empty = Array.isArray(child) ? false : child && typeof child === "object" && !Object.keys(child).length;
      if (!empty) break;
      delete parent[path[i]];
    }
  } else cur[last] = value;
}

/* ---------------- pontos de entrada ---------------- */

export type Role = "popup" | "options" | "sidepanel" | "background" | "content" | "content-css" | "icon" | "war" | "devtools" | "override" | "locale" | "sandbox";

export interface EntryRef {
  role: Role;
  path: string;
  /** onde a referência está no manifesto */
  jpath: JPath;
  /** rótulo curto (ex.: "Popup", "Ícone 48") */
  label: string;
}

const str = (v: unknown): v is string => typeof v === "string" && v.length > 0;
export const isGlob = (p: string) => /[*?]/.test(p);

export function entriesOf(m: Json): EntryRef[] {
  const out: EntryRef[] = [];
  if (!m || typeof m !== "object") return out;
  const add = (role: Role, path: unknown, jpath: JPath, label: string) => str(path) && out.push({ role, path: path.replace(/^\.?\//, ""), jpath, label });
  const action = m.action ?? m.browser_action ?? m.page_action;
  const actionKey = m.action ? "action" : m.browser_action ? "browser_action" : "page_action";
  if (action && typeof action === "object") {
    add("popup", action.default_popup, [actionKey, "default_popup"], "Popup");
    if (str(action.default_icon)) add("icon", action.default_icon, [actionKey, "default_icon"], "Ícone da ação");
    else if (action.default_icon && typeof action.default_icon === "object") for (const [s, p] of Object.entries(action.default_icon)) add("icon", p, [actionKey, "default_icon", s], `Ícone da ação ${s}`);
  }
  if (m.icons && typeof m.icons === "object") for (const [s, p] of Object.entries(m.icons)) add("icon", p, ["icons", s], `Ícone ${s}`);
  if (m.background && typeof m.background === "object") {
    add("background", m.background.service_worker, ["background", "service_worker"], "Service worker");
    if (Array.isArray(m.background.scripts)) m.background.scripts.forEach((s: unknown, i: number) => add("background", s, ["background", "scripts", i], "Script de fundo (MV2)"));
    add("background", m.background.page, ["background", "page"], "Página de fundo (MV2)");
  }
  add("options", m.options_page, ["options_page"], "Opções");
  if (m.options_ui && typeof m.options_ui === "object") add("options", m.options_ui.page, ["options_ui", "page"], "Opções");
  if (m.side_panel && typeof m.side_panel === "object") add("sidepanel", m.side_panel.default_path, ["side_panel", "default_path"], "Painel lateral");
  add("devtools", m.devtools_page, ["devtools_page"], "DevTools");
  if (m.chrome_url_overrides && typeof m.chrome_url_overrides === "object")
    for (const [k, p] of Object.entries(m.chrome_url_overrides)) add("override", p, ["chrome_url_overrides", k], k === "newtab" ? "Nova aba" : k === "history" ? "Histórico" : "Favoritos");
  if (Array.isArray(m.content_scripts))
    m.content_scripts.forEach((cs: Json, i: number) => {
      if (!cs || typeof cs !== "object") return;
      if (Array.isArray(cs.js)) cs.js.forEach((p: unknown, j: number) => add("content", p, ["content_scripts", i, "js", j], `Content script ${i + 1}`));
      if (Array.isArray(cs.css)) cs.css.forEach((p: unknown, j: number) => add("content-css", p, ["content_scripts", i, "css", j], `CSS do content script ${i + 1}`));
    });
  if (Array.isArray(m.web_accessible_resources))
    m.web_accessible_resources.forEach((w: Json, i: number) => {
      if (w && typeof w === "object" && Array.isArray(w.resources)) w.resources.forEach((p: unknown, j: number) => add("war", p, ["web_accessible_resources", i, "resources", j], "Recurso acessível pela web"));
    });
  if (m.sandbox && typeof m.sandbox === "object" && Array.isArray(m.sandbox.pages)) m.sandbox.pages.forEach((p: unknown, i: number) => add("sandbox", p, ["sandbox", "pages", i], "Página sandbox"));
  if (str(m.default_locale)) add("locale", `_locales/${m.default_locale}/messages.json`, ["default_locale"], "Traduções");
  return out;
}

/** Páginas HTML que rodam como páginas da extensão (valem as regras de CSP do MV3). */
export const PAGE_ROLES: Role[] = ["popup", "options", "sidepanel", "devtools", "override"];

/** Qual papel uma página HTML tem no manifesto (para o preview simulado). */
export function pageRole(m: Json, path: string): Role | null {
  for (const e of entriesOf(m)) if (PAGE_ROLES.includes(e.role) && e.path === path) return e.role;
  return null;
}

/* ---------------- dependências entre arquivos (para o mapa e a validação) ---------------- */

/** Referências de uma página HTML: scripts, estilos, imagens. */
export function htmlRefs(html: string): { kind: "script" | "style" | "asset"; ref: string; at: number }[] {
  const out: { kind: "script" | "style" | "asset"; ref: string; at: number }[] = [];
  for (const m of html.matchAll(/<script\b[^>]*?\ssrc\s*=\s*["']([^"']+)["']/gi)) out.push({ kind: "script", ref: m[1], at: m.index! });
  for (const m of html.matchAll(/<link\b[^>]*?>/gi)) {
    const href = /\shref\s*=\s*["']([^"']+)["']/i.exec(m[0]);
    if (!href) continue;
    const rel = /\srel\s*=\s*["']([^"']+)["']/i.exec(m[0])?.[1].toLowerCase() ?? "";
    out.push({ kind: rel.includes("stylesheet") ? "style" : "asset", ref: href[1], at: m.index! });
  }
  for (const m of html.matchAll(/<(?:img|source|audio|video)\b[^>]*?\ssrc\s*=\s*["']([^"']+)["']/gi)) out.push({ kind: "asset", ref: m[1], at: m.index! });
  return out;
}

/** import/export … from "x", import("x") e importScripts("x") de um JS. */
export function jsRefs(code: string): { ref: string; at: number; how: "import" | "dynamic" | "importScripts" }[] {
  const out: { ref: string; at: number; how: "import" | "dynamic" | "importScripts" }[] = [];
  for (const m of code.matchAll(/(?:^|[\n;])\s*(?:import|export)\s[^"'`;]*?from\s*["']([^"']+)["']|(?:^|[\n;])\s*import\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g))
    out.push({ ref: m[1] ?? m[2] ?? m[3], at: m.index! + m[0].search(/\S/), how: m[3] != null ? "dynamic" : "import" });
  for (const m of code.matchAll(/\bimportScripts\s*\(([^)]*)\)/g))
    for (const s of m[1].matchAll(/["']([^"']+)["']/g)) out.push({ ref: s[1], at: m.index!, how: "importScripts" });
  return out;
}

/** Lê largura e altura de um PNG em data URL (cabeçalho IHDR). */
export function pngSize(dataUrl: string): { w: number; h: number } | null {
  const m = /^data:image\/png;base64,(.*)$/.exec(dataUrl);
  if (!m) return null;
  try {
    const head = atob(m[1].slice(0, 44));
    if (head.slice(1, 4) !== "PNG") return null;
    const u32 = (o: number) => ((head.charCodeAt(o) << 24) | (head.charCodeAt(o + 1) << 16) | (head.charCodeAt(o + 2) << 8) | head.charCodeAt(o + 3)) >>> 0;
    return { w: u32(16), h: u32(20) };
  } catch {
    return null;
  }
}
