// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/* Fixtures do chrome.* simulado (arquivo poiesis.chrome.json do projeto): estado inicial do
 * chrome.storage, abas fictícias e respostas simuladas para mensagens ao service worker,
 * aos content scripts e a outras extensões. Só dados JSON — nada aqui é executado. */

export const CHROME_FILE = "poiesis.chrome.json";

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export interface ChromeTab {
  url: string;
  title: string;
  active: boolean;
}

export type Target = "runtime" | "tab" | "external";

export interface ChromeResponder {
  id: string;
  enabled: boolean;
  /** runtime = service worker; tab = content script; external = outra extensão */
  to: Target;
  /** a mensagem precisa conter estes campos com estes valores ({} casa com tudo) */
  match: { [k: string]: Json };
  response: Json;
  /** em vez de responder, falha com este texto */
  error: string | null;
  delay: number;
  /** só para "external": ID da extensão de destino (vazio = qualquer) */
  extensionId?: string;
}

export interface ChromeFixtures {
  version: 1;
  storage: { local: { [k: string]: Json }; sync: { [k: string]: Json } };
  tabs: ChromeTab[];
  messages: ChromeResponder[];
}

export const EMPTY_CHROME: ChromeFixtures = { version: 1, storage: { local: {}, sync: {} }, tabs: [], messages: [] };

export const TARGET_LABEL: Record<Target, string> = {
  runtime: "Service worker (runtime.sendMessage)",
  tab: "Content script (tabs.sendMessage)",
  external: "Outra extensão (sendMessage com ID)",
};

const MAX_TEXT = 1024 * 1024;
const isObj = (x: unknown): x is { [k: string]: Json } => !!x && typeof x === "object" && !Array.isArray(x);

export function parseChromeFixtures(text: string): { config: ChromeFixtures; errors: string[] } {
  const errors: string[] = [];
  if (text.length > MAX_TEXT) return { config: EMPTY_CHROME, errors: [`${CHROME_FILE} passa de 1 MB.`] };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { config: EMPTY_CHROME, errors: [`JSON inválido: ${String((e as Error).message).replace(/^JSON\.parse: /, "")}`] };
  }
  if (!isObj(raw)) return { config: EMPTY_CHROME, errors: ["O arquivo precisa ser um objeto JSON."] };
  const st = isObj(raw.storage) ? raw.storage : {};
  const storage = { local: isObj(st.local) ? st.local : {}, sync: isObj(st.sync) ? st.sync : {} };
  if (raw.storage != null && !isObj(raw.storage)) errors.push("\"storage\" precisa ser um objeto { local, sync }.");
  if (JSON.stringify(storage.sync).length > 102400) errors.push("storage.sync passa da cota real do Chrome (100 KB).");

  const tabs: ChromeTab[] = [];
  (Array.isArray(raw.tabs) ? raw.tabs : []).slice(0, 20).forEach((t, i) => {
    if (!isObj(t) || typeof t.url !== "string" || !/^(https?|file):\/\//i.test(t.url)) return void errors.push(`Aba ${i + 1}: "url" precisa começar com http://, https:// ou file://.`);
    tabs.push({ url: t.url.slice(0, 2000), title: typeof t.title === "string" ? t.title.slice(0, 200) : "", active: t.active === true });
  });
  if (tabs.length && !tabs.some((t) => t.active)) tabs[0].active = true;

  const messages: ChromeResponder[] = [];
  const ids = new Set<string>();
  (Array.isArray(raw.messages) ? raw.messages : []).slice(0, 100).forEach((m, i) => {
    const where = `Resposta ${i + 1}`;
    if (!isObj(m)) return void errors.push(`${where}: precisa ser um objeto.`);
    const id = typeof m.id === "string" && /^[\w-]{1,40}$/.test(m.id) ? m.id : `resposta-${i + 1}`;
    if (ids.has(id)) return void errors.push(`${where}: o id “${id}” está repetido.`);
    ids.add(id);
    const to = m.to === "tab" || m.to === "external" ? m.to : m.to === "runtime" || m.to == null ? "runtime" : null;
    if (!to) return void errors.push(`${where}: "to" aceita runtime, tab ou external.`);
    if (m.match != null && !isObj(m.match)) return void errors.push(`${where}: "match" precisa ser um objeto (ex.: { "tipo": "contar" }).`);
    const delay = typeof m.delay === "number" && Number.isFinite(m.delay) ? Math.max(0, Math.min(30000, Math.round(m.delay))) : 0;
    messages.push({
      id,
      enabled: m.enabled !== false,
      to,
      match: isObj(m.match) ? m.match : {},
      response: m.response === undefined ? null : (m.response as Json),
      error: typeof m.error === "string" && m.error ? m.error.slice(0, 300) : null,
      delay,
      ...(to === "external" && typeof m.extensionId === "string" && m.extensionId ? { extensionId: m.extensionId.slice(0, 32) } : {}),
    });
  });
  return { config: { version: 1, storage, tabs, messages }, errors };
}

export const stringifyChromeFixtures = (c: ChromeFixtures) => JSON.stringify(c, null, 2) + "\n";
