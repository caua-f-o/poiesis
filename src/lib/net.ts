// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/* Painel de rede: tipos, validação, mascaramento de segredos, mocks e exportação.
 *
 * Segurança:
 *  - registros vêm da página do usuário (não confiável): o bridge valida e limita cada campo;
 *  - nada é persistido: o registro vive só na memória, por projeto, com limite de tamanho;
 *  - credenciais (Authorization, Cookie, tokens na URL…) aparecem mascaradas por padrão e
 *    SEMPRE mascaradas na exportação;
 *  - respostas são mostradas como texto (nunca interpretadas como HTML). */

export type NetKind = "fetch" | "xhr" | "beacon" | "resource" | "ws";
export type NetSource = "network" | "project" | "mock";
export type NetErrorKind = "network" | "cors" | "timeout" | "abort" | "mock" | "offline" | "unknown";

export interface NetBody {
  /** text = texto/JSON; form = pares; binary/stream/none = só tamanho */
  t: "text" | "form" | "binary" | "stream" | "none" | "opaque";
  v?: string;
  size: number;
  truncated?: boolean;
  mime?: string;
}

export interface NetEntry {
  id: string;
  kind: NetKind;
  method: string;
  url: string;
  source: NetSource;
  start: number;
  /** ms; ausente enquanto pendente */
  duration?: number;
  status?: number;
  statusText?: string;
  reqHeaders: [string, string][];
  resHeaders: [string, string][];
  reqBody: NetBody;
  resBody?: NetBody;
  error?: { kind: NetErrorKind; message: string };
  mockId?: string;
  initiator?: string;
  fromConsole?: boolean;
  /** sem detalhes (resource timing): só URL, tipo e tempo */
  partial?: boolean;
  initiatorType?: string;
}

/* ---------------- limites ---------------- */

export const NET_LIMITS = {
  entries: 500,
  body: 256 * 1024,
  headers: 100,
  headerValue: 8192,
  url: 8192,
};

/* ---------------- validação (dados vindos da página) ---------------- */

const KINDS = new Set<NetKind>(["fetch", "xhr", "beacon", "resource", "ws"]);
const SOURCES = new Set<NetSource>(["network", "project", "mock"]);
const ERRORS = new Set<NetErrorKind>(["network", "cors", "timeout", "abort", "mock", "offline", "unknown"]);
const BODY_T = new Set<NetBody["t"]>(["text", "form", "binary", "stream", "none", "opaque"]);

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const str = (x: unknown, max: number) => (typeof x === "string" ? (x.length > max ? x.slice(0, max) : x) : undefined);
const num = (x: unknown, min = -Infinity, max = Infinity) => (typeof x === "number" && Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : undefined);

function headers(x: unknown): [string, string][] {
  if (!Array.isArray(x)) return [];
  const out: [string, string][] = [];
  for (const h of x.slice(0, NET_LIMITS.headers)) {
    if (!Array.isArray(h) || h.length !== 2) continue;
    const k = str(h[0], 256);
    const v = str(h[1], NET_LIMITS.headerValue);
    if (k !== undefined && v !== undefined && /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(k)) out.push([k, v]);
  }
  return out;
}

function body(x: unknown): NetBody | undefined {
  if (!isObj(x) || !BODY_T.has(x.t as NetBody["t"])) return undefined;
  const v = str(x.v, NET_LIMITS.body);
  return {
    t: x.t as NetBody["t"],
    ...(v !== undefined ? { v } : {}),
    size: num(x.size, 0, 1e12) ?? 0,
    ...(x.truncated === true || (typeof x.v === "string" && x.v.length > NET_LIMITS.body) ? { truncated: true } : {}),
    ...(str(x.mime, 200) ? { mime: str(x.mime, 200) } : {}),
  };
}

/** Copia só os campos esperados, com tipos e tamanhos conferidos. Devolve null se inválido. */
export function sanitizeEntry(x: unknown): NetEntry | null {
  if (!isObj(x)) return null;
  const id = str(x.id, 64);
  const kind = x.kind as NetKind;
  const method = str(x.method, 16);
  const url = str(x.url, NET_LIMITS.url);
  if (!id || !/^[\w-]+$/.test(id) || !KINDS.has(kind) || !method || !/^[A-Z]+$/.test(method) || url === undefined) return null;
  const source = SOURCES.has(x.source as NetSource) ? (x.source as NetSource) : "network";
  const e: NetEntry = {
    id,
    kind,
    method,
    url,
    source,
    start: num(x.start, 0, 1e15) ?? Date.now(),
    reqHeaders: headers(x.reqHeaders),
    resHeaders: headers(x.resHeaders),
    reqBody: body(x.reqBody) ?? { t: "none", size: 0 },
  };
  const d = num(x.duration, 0, 1e9);
  if (d !== undefined) e.duration = d;
  const st = num(x.status, 0, 999);
  if (st !== undefined) e.status = Math.round(st);
  const stt = str(x.statusText, 200);
  if (stt) e.statusText = stt;
  const rb = body(x.resBody);
  if (rb) e.resBody = rb;
  if (isObj(x.error)) {
    const k = x.error.kind as NetErrorKind;
    e.error = { kind: ERRORS.has(k) ? k : "unknown", message: str(x.error.message, 1000) ?? "" };
  }
  const mockId = str(x.mockId, 64);
  if (mockId) e.mockId = mockId;
  const ini = str(x.initiator, 300);
  if (ini) e.initiator = ini;
  if (x.fromConsole === true) e.fromConsole = true;
  if (x.partial === true) e.partial = true;
  const it = str(x.initiatorType, 40);
  if (it) e.initiatorType = it;
  return e;
}

/* ---------------- segredos ---------------- */

const SECRET_HEADERS = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key|x-auth-token|x-access-token|x-csrf-token|x-xsrf-token|x-amz-security-token)$/i;
const SECRET_PARAMS = /^(access_token|refresh_token|id_token|token|api_key|apikey|api-key|key|secret|client_secret|password|passwd|pwd|auth|signature|sig|session|sessionid|code)$/i;
const MASK = "••••••";

export const isSecretHeader = (k: string) => SECRET_HEADERS.test(k);

export function maskHeaders(h: [string, string][]): [string, string][] {
  return h.map(([k, v]) => {
    if (!SECRET_HEADERS.test(k)) return [k, v];
    // "Bearer abc" → "Bearer ••••••" (mantém o esquema, que ajuda a diagnosticar)
    const m = /^(\w+)\s+\S/.exec(v);
    return [k, m && /authorization/i.test(k) ? `${m[1]} ${MASK}` : MASK];
  });
}

export function maskUrl(u: string): string {
  try {
    const url = new URL(u);
    if (url.username || url.password) {
      url.username = url.username ? MASK : "";
      url.password = url.password ? MASK : "";
    }
    for (const k of [...url.searchParams.keys()]) if (SECRET_PARAMS.test(k)) url.searchParams.set(k, MASK);
    return url.toString();
  } catch {
    return u.replace(/([?&](?:access_token|token|api_key|apikey|key|secret|password|signature|sig)=)[^&#]*/gi, `$1${MASK}`);
  }
}

/** Mascara campos com nome de segredo num corpo JSON ou x-www-form-urlencoded. */
export function maskBody(b: NetBody | undefined): NetBody | undefined {
  if (!b || b.v == null) return b;
  const v = b.v.trim();
  if (v.startsWith("{") || v.startsWith("[")) {
    try {
      const walk = (x: unknown): unknown => {
        if (Array.isArray(x)) return x.map(walk);
        if (isObj(x)) return Object.fromEntries(Object.entries(x).map(([k, val]) => [k, SECRET_PARAMS.test(k) || /pass|secret|token|senha|segredo|chave/i.test(k) ? MASK : walk(val)]));
        return x;
      };
      return { ...b, v: JSON.stringify(walk(JSON.parse(v)), null, 2) };
    } catch {
      return b;
    }
  }
  if (b.t === "form" || /^[\w.%-]+=[^&]*(&[\w.%-]+=[^&]*)*$/.test(v)) {
    try {
      const p = new URLSearchParams(v);
      for (const k of [...p.keys()]) if (SECRET_PARAMS.test(k) || /pass|secret|token|senha|segredo|chave/i.test(k)) p.set(k, MASK);
      return { ...b, v: p.toString() };
    } catch {
      return b;
    }
  }
  return b;
}

export function masked(e: NetEntry): NetEntry {
  return { ...e, url: maskUrl(e.url), reqHeaders: maskHeaders(e.reqHeaders), resHeaders: maskHeaders(e.resHeaders), reqBody: maskBody(e.reqBody)!, resBody: maskBody(e.resBody) };
}

/* ---------------- diagnóstico ---------------- */

export function diagnose(e: NetEntry): { title: string; detail: string; tone: "ok" | "warn" | "error" | "info" } {
  if (e.partial) return { title: "Observado sem detalhes", detail: "Carregado por tag (<img>, <script>, <link>, CSS…). O navegador só informa URL, tipo e tempo; cabeçalhos e corpo não são visíveis.", tone: "info" };
  if (e.duration === undefined && !e.error) return { title: "Pendente", detail: "Aguardando resposta.", tone: "info" };
  if (e.error) {
    switch (e.error.kind) {
      case "mock":
        return { title: "Erro simulado (mock)", detail: e.error.message || "Falha de rede simulada por um mock.", tone: "warn" };
      case "timeout":
        return { title: "Tempo esgotado", detail: "A requisição foi cancelada por tempo (timeout). Nenhuma resposta HTTP chegou.", tone: "error" };
      case "abort":
        return { title: "Cancelada", detail: "O código da página cancelou a requisição (AbortController).", tone: "warn" };
      case "offline":
        return { title: "Sem conexão", detail: "O navegador está offline. Nenhuma resposta HTTP chegou. Mocks continuam funcionando sem rede.", tone: "error" };
      case "cors":
        return {
          title: "Provável bloqueio de CORS",
          detail:
            "Sem resposta HTTP visível para a página. O preview roda numa origem isolada (Origin: null): a API precisa responder com Access-Control-Allow-Origin: * (ou null). Também pode ser DNS ou servidor fora do ar — o navegador não diferencia esses casos para a página.",
          tone: "error",
        };
      default:
        return { title: "Falha de rede", detail: e.error.message || "Nenhuma resposta HTTP chegou.", tone: "error" };
    }
  }
  if (e.resBody?.t === "opaque") return { title: "Resposta opaca (no-cors)", detail: "A página pediu mode: 'no-cors'; o navegador esconde status, cabeçalhos e corpo.", tone: "info" };
  const s = e.status ?? 0;
  if (s >= 500) return { title: `HTTP ${s} — erro no servidor`, detail: "A resposta chegou, mas o servidor indicou falha.", tone: "error" };
  if (s >= 400) return { title: `HTTP ${s} — erro na requisição`, detail: s === 401 || s === 403 ? "Sem autorização: confira token/credenciais." : s === 404 ? "Endereço não encontrado." : "O servidor recusou a requisição.", tone: "warn" };
  if (s >= 300) return { title: `HTTP ${s} — redirecionamento`, detail: "", tone: "info" };
  return { title: `HTTP ${s} ${e.statusText ?? ""}`.trim(), detail: e.source === "mock" ? "Resposta simulada por um mock." : e.source === "project" ? "Arquivo do projeto servido pelo Poiesis." : "", tone: "ok" };
}

/* ---------------- mocks ---------------- */

export const MOCKS_FILE = "poiesis.mocks.json";

export interface MockRule {
  id: string;
  enabled: boolean;
  /** GET, POST… ou * */
  method: string;
  /** caminho (/api/users/*) ou URL absoluta (https://api.exemplo.com/v1/**) */
  url: string;
  status: number;
  headers: Record<string, string>;
  /** corpo literal (objeto/array vira JSON) */
  body?: unknown;
  /** arquivo do projeto com o corpo (fixture) */
  bodyFile?: string;
  /** latência em ms */
  delay: number;
  /** falha simulada no lugar da resposta */
  error?: "network" | "timeout" | null;
  note?: string;
}

export interface MocksConfig {
  version: 1;
  enabled: boolean;
  mocks: MockRule[];
}

export const MAX_DELAY = 30_000;
const METHODS = /^(\*|GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/;

/** Lê e valida o arquivo de mocks. Erros viram mensagens; regras inválidas são descartadas. */
export function parseMocks(text: string): { config: MocksConfig; errors: string[] } {
  const errors: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { config: { version: 1, enabled: false, mocks: [] }, errors: [`${MOCKS_FILE}: JSON inválido (${(e as Error).message})`] };
  }
  if (!isObj(raw)) return { config: { version: 1, enabled: false, mocks: [] }, errors: [`${MOCKS_FILE}: esperado um objeto`] };
  const list = Array.isArray(raw.mocks) ? raw.mocks.slice(0, 500) : [];
  const mocks: MockRule[] = [];
  list.forEach((m, i) => {
    const where = `mock ${i + 1}`;
    if (!isObj(m)) return errors.push(`${where}: esperado um objeto`);
    const url = str(m.url, 2048);
    if (!url) return errors.push(`${where}: falta "url"`);
    if ((url.match(/\*/g) ?? []).length > 8) return errors.push(`${where}: padrão com "*" demais (máx. 8)`);
    if (/[\r\n\s]/.test(url)) return errors.push(`${where}: a URL não pode ter espaços ou quebras de linha`);
    const method = (str(m.method, 10) ?? "*").toUpperCase();
    if (!METHODS.test(method)) return errors.push(`${where}: método "${method}" inválido`);
    const status = Math.round(num(m.status, 100, 599) ?? 200);
    const hs: Record<string, string> = {};
    if (isObj(m.headers))
      for (const [k, v] of Object.entries(m.headers).slice(0, 50)) {
        if (/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(k) && typeof v === "string" && v.length <= NET_LIMITS.headerValue && !/[\r\n]/.test(v)) hs[k] = v;
        else errors.push(`${where}: cabeçalho "${k}" ignorado`);
      }
    const err = m.error === "network" || m.error === "timeout" ? m.error : null;
    mocks.push({
      id: str(m.id, 64)?.replace(/[^\w-]/g, "") || `m${i + 1}`,
      enabled: m.enabled !== false,
      method,
      url,
      status,
      headers: hs,
      ...(m.body !== undefined ? { body: m.body } : {}),
      ...(str(m.bodyFile, 1024) ? { bodyFile: str(m.bodyFile, 1024) } : {}),
      delay: Math.round(num(m.delay, 0, MAX_DELAY) ?? 0),
      error: err,
      ...(str(m.note, 500) ? { note: str(m.note, 500) } : {}),
    });
  });
  return { config: { version: 1, enabled: raw.enabled !== false, mocks }, errors };
}

export function stringifyMocks(c: MocksConfig): string {
  return JSON.stringify(c, null, 2) + "\n";
}

export const EMPTY_MOCKS: MocksConfig = { version: 1, enabled: true, mocks: [] };

/* ---------------- exportação (HAR 1.2, sempre mascarado) ---------------- */

export function toHar(entries: NetEntry[], pageTitle: string) {
  const h = (list: [string, string][]) => list.map(([name, value]) => ({ name, value }));
  return {
    log: {
      version: "1.2",
      creator: { name: "Poiesis", version: "2", comment: "Credenciais mascaradas. Corpos acima de 256 KB truncados." },
      pages: [{ id: "page_1", title: pageTitle, startedDateTime: new Date(entries[0]?.start ?? Date.now()).toISOString(), pageTimings: {} }],
      entries: entries
        .filter((e) => !e.partial)
        .map((raw) => {
          const e = masked(raw);
          let query: { name: string; value: string }[] = [];
          try {
            query = [...new URL(e.url).searchParams.entries()].map(([name, value]) => ({ name, value }));
          } catch {
            /* URL relativa */
          }
          return {
            pageref: "page_1",
            startedDateTime: new Date(e.start).toISOString(),
            time: e.duration ?? 0,
            request: {
              method: e.method,
              url: e.url,
              httpVersion: "HTTP/1.1",
              headers: h(e.reqHeaders),
              queryString: query,
              cookies: [],
              headersSize: -1,
              bodySize: e.reqBody.size,
              ...(e.reqBody.v != null ? { postData: { mimeType: e.reqHeaders.find(([k]) => /content-type/i.test(k))?.[1] ?? "text/plain", text: e.reqBody.v } } : {}),
            },
            response: {
              status: e.status ?? 0,
              statusText: e.statusText ?? "",
              httpVersion: "HTTP/1.1",
              headers: h(e.resHeaders),
              cookies: [],
              content: { size: e.resBody?.size ?? 0, mimeType: e.resBody?.mime ?? "", ...(e.resBody?.v != null ? { text: e.resBody.v } : {}) },
              redirectURL: "",
              headersSize: -1,
              bodySize: e.resBody?.size ?? -1,
              ...(e.error ? { _error: `${e.error.kind}: ${e.error.message}` } : {}),
            },
            cache: {},
            timings: { send: 0, wait: e.duration ?? 0, receive: 0 },
            _source: e.source,
            ...(e.mockId ? { _mock: e.mockId } : {}),
          };
        }),
    },
  };
}

/* ---------------- utilidades de exibição ---------------- */

export function shortName(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() ?? u.host;
    return last + (u.search ? u.search : "");
  } catch {
    return url;
  }
}

export function isJsonText(b?: NetBody): boolean {
  if (!b?.v) return false;
  const t = b.v.trim();
  return (/json/i.test(b.mime ?? "") || t.startsWith("{") || t.startsWith("[")) && (() => {
    try {
      JSON.parse(t);
      return true;
    } catch {
      return false;
    }
  })();
}
