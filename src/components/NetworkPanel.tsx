// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/* Painel "Rede": requisições do preview, detalhes, diagnóstico, console de APIs e mocks.
 * Todo conteúdo vindo da página é exibido como TEXTO (React escapa; nada de innerHTML). */
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  diagnose,
  isJsonText,
  isSecretHeader,
  masked,
  shortName,
  type MockRule,
  type MocksConfig,
  type NetBody,
  type NetEntry,
} from "@/lib/net";
import { formatBytes } from "@/lib/db";
import { Icon } from "./Icon";
import { IconButton, Tip } from "./md";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Filter = "all" | "xhr" | "other" | "mock" | "errors";

const statusTone = (e: NetEntry) => {
  if (e.partial) return "text-md-on-variant";
  if (e.error) return "text-[var(--rose)]";
  if (e.duration === undefined) return "text-md-on-variant";
  const s = e.status ?? 0;
  if (s >= 400) return s >= 500 ? "text-[var(--rose)]" : "text-[var(--amber)]";
  return "text-[var(--verd)]";
};

const statusLabel = (e: NetEntry) => {
  if (e.error) return e.error.kind === "cors" ? "CORS?" : e.error.kind === "timeout" ? "timeout" : e.error.kind === "abort" ? "cancel." : e.error.kind === "mock" ? "falha" : "erro";
  if (e.duration === undefined && !e.partial) return "…";
  if (e.resBody?.t === "opaque") return "opaca";
  return e.status ? String(e.status) : e.partial ? "—" : "0";
};

const KIND_LABEL: Record<NetEntry["kind"], string> = { fetch: "fetch", xhr: "xhr", beacon: "beacon", resource: "recurso", ws: "websocket" };

/* ---------- realce simples de JSON (spans de texto) ---------- */
function JsonText({ text }: { text: string }) {
  const parts = useMemo(() => {
    const out: ReactNode[] = [];
    const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = re.exec(text)) && i < 20000) {
      if (m.index > last) out.push(text.slice(last, m.index));
      if (m[1]) out.push(<span key={i++} className={m[2] ? "text-[var(--syn-prop)]" : "text-[var(--syn-string)]"}>{m[1]}</span>, m[2] ?? "");
      else if (m[3]) out.push(<span key={i++} className="text-[var(--syn-keyword)]">{m[3]}</span>);
      else out.push(<span key={i++} className="text-[var(--syn-number)]">{m[4]}</span>);
      last = re.lastIndex;
    }
    out.push(text.slice(last));
    return out;
  }, [text]);
  return <>{parts}</>;
}

function BodyView({ b, empty }: { b?: NetBody; empty: string }) {
  if (!b || b.t === "none") return <div className="p-4 text-[12px] text-md-on-variant">{empty}</div>;
  if (b.t === "opaque") return <div className="p-4 text-[12px] text-md-on-variant">Resposta opaca (no-cors): o navegador não deixa a página ler o conteúdo.</div>;
  if (b.t === "stream") return <div className="p-4 text-[12px] text-md-on-variant">Fluxo contínuo (stream/event-stream): o conteúdo não é capturado.</div>;
  if (b.t === "binary" || b.v == null)
    return (
      <div className="p-4 text-[12px] text-md-on-variant">
        Conteúdo binário ou grande demais para mostrar{b.mime ? ` (${b.mime})` : ""}
        {b.size ? ` · ${formatBytes(b.size)}` : ""}.
      </div>
    );
  const json = isJsonText(b);
  const text = json ? JSON.stringify(JSON.parse(b.v), null, 2) : b.v;
  return (
    <div>
      {b.truncated && <div className="border-b border-md-outline-v px-4 py-1.5 text-[11.5px] text-[var(--amber)]">Mostrando só os primeiros 256 KB de {formatBytes(b.size)}.</div>}
      <pre className="whitespace-pre-wrap break-words p-4 font-code text-[12px] leading-relaxed text-md-on-surface">{json ? <JsonText text={text} /> : text}</pre>
    </div>
  );
}

function HeaderTable({ rows, reveal }: { rows: [string, string][]; reveal: boolean }) {
  if (!rows.length) return <div className="px-4 py-2 text-[12px] text-md-on-variant">Nenhum.</div>;
  return (
    <div className="grid grid-cols-[minmax(120px,auto)_1fr] gap-x-4 gap-y-1 px-4 py-2 font-code text-[12px]">
      {rows.map(([k, v], i) => (
        <Fragment key={i}>
          <span className="text-[var(--syn-prop)]">{k}</span>
          <span className={cn("break-all text-md-on-surface", isSecretHeader(k) && !reveal && "text-md-on-variant")}>
            {v}
            {isSecretHeader(k) && <Icon name={reveal ? "lock_open" : "lock"} size={12} className="ml-1 align-[-1px] text-[var(--amber)]" title="Valor sensível" />}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

type Tab = "resumo" | "headers" | "envio" | "resposta";

export interface NetRequest {
  method: string;
  url: string;
  headers: [string, string][];
  body: string;
  timeout: number;
}

export function NetworkPanel({
  title,
  entries,
  mocks,
  mockErrors,
  preserve,
  onPreserve,
  onClear,
  onClose,
  onExport,
  onMocks,
  onRequest,
  onMockFrom,
  onJump,
  extNote,
}: {
  title: ReactNode;
  entries: NetEntry[];
  mocks: MocksConfig | null;
  mockErrors: string[];
  preserve: boolean;
  onPreserve(v: boolean): void;
  onClear(): void;
  onClose(): void;
  onExport(): void;
  onMocks(): void;
  onRequest(prefill?: NetRequest): void;
  onMockFrom(e: NetEntry): void;
  onJump(initiator: string): void;
  /** projeto de extensão: avisa o que não aparece aqui */
  extNote?: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("resumo");
  const [reveal, setReveal] = useState(false);

  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter === "xhr" && !(e.kind === "fetch" || e.kind === "xhr")) return false;
      if (filter === "other" && (e.kind === "fetch" || e.kind === "xhr")) return false;
      if (filter === "mock" && e.source !== "mock") return false;
      if (filter === "errors" && !(e.error || (e.status ?? 0) >= 400)) return false;
      if (query && !`${e.method} ${e.url} ${e.status ?? ""}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [entries, filter, q]);

  // última requisição do console de APIs ganha foco
  const lastConsole = [...entries].reverse().find((e) => e.fromConsole);
  useEffect(() => {
    if (lastConsole) {
      setSel(lastConsole.id);
      setTab("resposta");
    }
  }, [lastConsole?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const raw = entries.find((e) => e.id === sel) ?? null;
  const cur = raw ? (reveal ? raw : masked(raw)) : null;
  const maxEnd = Math.max(1, ...shown.map((e) => e.start + (e.duration ?? 0)));
  const minStart = Math.min(...shown.map((e) => e.start), maxEnd);
  const errors = entries.filter((e) => e.error || (e.status ?? 0) >= 400).length;
  const activeMocks = mocks?.enabled ? mocks.mocks.filter((m) => m.enabled).length : 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-md-outline-v pl-3 pr-2">
        {title}
        <div className="flex-1" />
        <Tip label="Nova requisição (console de APIs)">
          <button className="md-btn md-btn-tonal h-7 shrink-0 px-2.5 text-[12px]" onClick={() => onRequest()} aria-label="Nova requisição">
            <Icon name="send" size={16} />
          </button>
        </Tip>
        <Tip label={mockErrors.length ? `Mocks — ${mockErrors.length} problema(s) no arquivo` : "Mocks"}>
          <button className="md-btn md-btn-text h-7 shrink-0 gap-1 px-2 text-[12px]" onClick={onMocks} aria-label="Mocks">
            <Icon name="dns" size={16} />
            {activeMocks > 0 && <span className="rounded-full bg-md-primary px-1.5 text-[10px] font-bold text-md-on-primary">{activeMocks}</span>}
            {mockErrors.length > 0 && <Icon name="error" size={14} className="text-[var(--rose)]" />}
          </button>
        </Tip>
        <IconButton icon={reveal ? "visibility" : "visibility_off"} label={reveal ? "Mascarar dados sensíveis" : "Mostrar dados sensíveis (tokens, cookies)"} size="sm" on={reveal} onClick={() => setReveal(!reveal)} />
        <IconButton icon="history_toggle_off" label={preserve ? "Não preservar ao recarregar" : "Preservar registro ao recarregar"} size="sm" on={preserve} onClick={() => onPreserve(!preserve)} />
        <IconButton icon="download" label="Exportar HAR (dados sensíveis sempre mascarados)" size="sm" onClick={onExport} disabled={!entries.length} />
        <IconButton icon="block" label="Limpar registro" size="sm" onClick={onClear} />
        <IconButton icon="keyboard_arrow_down" label="Esconder painel" shortcut="Ctrl+J" size="sm" onClick={onClose} />
      </div>

        <div className="no-scrollbar flex h-10 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-md-outline-v px-3">
        {(
          [
            ["all", "Tudo"],
            ["xhr", "Fetch/XHR"],
            ["other", "Outros"],
            ["mock", "Mocks"],
            ["errors", "Erros"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} className="md-chip" data-on={filter === k} onClick={() => setFilter(k)}>
            {filter === k && <Icon name="check" size={16} />}
            {label}
            {k === "errors" && errors > 0 && <span className="rounded-full bg-md-error px-1.5 text-[10px] font-bold tabular-nums text-md-surface">{errors}</span>}
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filtrar URL"
          aria-label="Filtrar requisições"
          className="ml-1 h-7 w-28 shrink-0 rounded-full bg-md-high px-3 text-[12px] text-md-on-surface outline-none placeholder:text-md-on-variant focus:w-44"
        />
        </div>
      {extNote && (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-md-outline-v px-3 py-1 text-[11.5px] text-md-on-variant" data-pz="net-ext-note">
          <Icon name="extension" size={14} />
          Aqui aparecem as requisições do popup, das opções e do painel lateral (e os mocks valem para elas). As do service worker e dos content scripts só no DevTools da extensão instalada.
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <div className={cn("min-h-0 overflow-y-auto", cur ? "w-[46%] border-r border-md-outline-v" : "flex-1")} role="listbox" aria-label="Requisições">
          {!shown.length && (
            <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center text-[12px] text-md-on-variant">
              <Icon name="lan" size={22} />
              {entries.length ? "Nada com esse filtro." : "Nenhuma requisição ainda. fetch, XHR e recursos carregados pela página aparecem aqui."}
            </div>
          )}
          {shown.map((e) => (
            <button
              key={e.id}
              role="option"
              aria-selected={e.id === sel}
              data-on={e.id === sel}
              onClick={() => setSel(e.id === sel ? null : e.id)}
              className={cn("md-item grid h-7 w-full grid-cols-[52px_52px_1fr_auto] items-center gap-2 rounded-none px-3 text-left font-code text-[11.5px]", e.partial && "opacity-75")}
            >
              <span className={cn("tabular-nums", statusTone(e))}>{statusLabel(e)}</span>
              <span className="text-md-on-variant">{e.method}</span>
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-md-on-surface">{shortName(reveal ? e.url : masked(e).url)}</span>
                {e.source === "mock" && <span className="shrink-0 rounded bg-md-primary-c px-1 text-[9.5px] font-bold uppercase text-md-on-primary-c">mock</span>}
                {e.source === "project" && <span className="shrink-0 rounded bg-md-high px-1 text-[9.5px] uppercase text-md-on-variant">projeto</span>}
                {e.fromConsole && <span className="shrink-0 rounded bg-md-high px-1 text-[9.5px] uppercase text-md-on-variant">console</span>}
              </span>
              <span className="flex items-center gap-2 text-md-on-variant">
                {!cur && <span className="w-16 text-right">{KIND_LABEL[e.kind]}</span>}
                {!cur && <span className="w-16 text-right tabular-nums">{e.resBody?.size ? formatBytes(e.resBody.size) : ""}</span>}
                <span className="w-14 text-right tabular-nums">{e.duration !== undefined ? `${Math.round(e.duration)} ms` : ""}</span>
                {!cur && (
                  <span className="relative h-1.5 w-24 overflow-hidden rounded-full bg-md-high">
                    <span
                      className={cn("absolute h-full rounded-full", e.error ? "bg-[var(--rose)]" : e.source === "mock" ? "bg-md-primary" : "bg-[var(--verd)]")}
                      style={{ left: `${((e.start - minStart) / (maxEnd - minStart || 1)) * 100}%`, width: `${Math.max(2, ((e.duration ?? 0) / (maxEnd - minStart || 1)) * 100)}%` }}
                    />
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>

        {cur && raw && (
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="no-scrollbar flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-md-outline-v px-2">
              {(
                [
                  ["resumo", "Resumo"],
                  ["headers", "Cabeçalhos"],
                  ["envio", "Envio"],
                  ["resposta", "Resposta"],
                ] as const
              ).map(([k, label]) => (
                <button key={k} data-on={tab === k} onClick={() => setTab(k)} className="md-chip h-7 text-[12px]">
                  {label}
                </button>
              ))}
              <div className="flex-1" />
              {!raw.partial && (
                <Tip label="Repetir no console de APIs">
                  <IconButton
                    icon="replay"
                    label="Repetir no console de APIs"
                    size="sm"
                    onClick={() => onRequest({ method: raw.method, url: raw.url, headers: raw.reqHeaders, body: raw.reqBody.v ?? "", timeout: 30000 })}
                  />
                </Tip>
              )}
              {!raw.partial && raw.resBody?.v != null && raw.source !== "mock" && (
                <button className="md-btn md-btn-text h-7 px-2 text-[12px]" onClick={() => onMockFrom(raw)}>
                  <Icon name="add_box" size={16} /> Criar mock
                </button>
              )}
              <IconButton icon="close" label="Fechar detalhes" size="sm" onClick={() => setSel(null)} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {tab === "resumo" && <Summary e={cur} onJump={onJump} />}
              {tab === "headers" && (
                <div>
                  {!reveal && cur.reqHeaders.concat(cur.resHeaders).some(([k]) => isSecretHeader(k)) && (
                    <div className="border-b border-md-outline-v px-4 py-1.5 text-[11.5px] text-md-on-variant">Valores sensíveis mascarados. Use o olho na barra para mostrar.</div>
                  )}
                  <div className="eyebrow px-4 pt-3">Requisição</div>
                  <HeaderTable rows={cur.reqHeaders} reveal={reveal} />
                  <div className="eyebrow px-4 pt-3">Resposta</div>
                  <HeaderTable rows={cur.resHeaders} reveal={reveal} />
                  {raw.kind === "fetch" && (
                    <div className="px-4 pb-3 pt-2 text-[11.5px] leading-relaxed text-md-on-variant">
                      Cabeçalhos que o navegador adiciona sozinho (Origin, User-Agent, cookies…) não aparecem para a página. A origem do preview é <code className="font-code">null</code>.
                    </div>
                  )}
                </div>
              )}
              {tab === "envio" && (
                <div>
                  <QueryParams url={cur.url} />
                  <div className="eyebrow px-4 pt-3">Corpo</div>
                  <BodyView b={cur.reqBody} empty="Sem corpo." />
                </div>
              )}
              {tab === "resposta" && <BodyView b={cur.resBody} empty={cur.duration === undefined ? "Aguardando resposta…" : "Sem corpo."} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function QueryParams({ url }: { url: string }) {
  let params: [string, string][] = [];
  try {
    params = [...new URL(url, "https://projeto.poiesis/").searchParams.entries()];
  } catch {
    /* ignora */
  }
  return (
    <>
      <div className="eyebrow px-4 pt-3">Parâmetros da URL</div>
      <HeaderTable rows={params} reveal />
    </>
  );
}

function Summary({ e, onJump }: { e: NetEntry; onJump(i: string): void }) {
  const d = diagnose(e);
  const tone = { ok: "border-[var(--verd)]", warn: "border-[var(--amber)]", error: "border-[var(--rose)]", info: "border-md-outline" }[d.tone];
  return (
    <div className="grid gap-3 p-4 text-[12.5px]">
      <div className={cn("rounded-xl border-l-4 bg-md-high px-3 py-2", tone)}>
        <div className="font-medium text-md-on-surface">{d.title}</div>
        {d.detail && <div className="mt-0.5 leading-relaxed text-md-on-variant">{d.detail}</div>}
        {e.error?.message && e.error.kind !== "mock" && <div className="mt-1 font-code text-[11.5px] text-md-on-variant">{e.error.message}</div>}
      </div>
      <div className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5">
        <span className="text-md-on-variant">URL</span>
        <span className="break-all font-code text-[12px] text-md-on-surface">{e.url}</span>
        <span className="text-md-on-variant">Método</span>
        <span className="font-code">{e.method}</span>
        <span className="text-md-on-variant">Tipo</span>
        <span>
          {KIND_LABEL[e.kind]}
          {e.initiatorType && e.kind === "resource" ? ` (${e.initiatorType})` : ""}
        </span>
        <span className="text-md-on-variant">Origem</span>
        <span>{e.source === "mock" ? `mock${e.mockId ? ` "${e.mockId}"` : ""}` : e.source === "project" ? "arquivo do projeto" : "rede"}</span>
        {e.duration !== undefined && (
          <>
            <span className="text-md-on-variant">Duração</span>
            <span className="tabular-nums">{Math.round(e.duration)} ms</span>
          </>
        )}
        {!!e.resBody?.size && (
          <>
            <span className="text-md-on-variant">Tamanho</span>
            <span>{formatBytes(e.resBody.size)}</span>
          </>
        )}
        {e.initiator && (
          <>
            <span className="text-md-on-variant">Chamado em</span>
            <button className="w-fit font-code text-[12px] text-md-primary underline-offset-2 hover:underline" onClick={() => onJump(e.initiator!)}>
              {e.initiator}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- console de APIs ---------------- */

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export function RequestDialog({ open, prefill, onOpenChange, onSend }: { open: boolean; prefill?: NetRequest; onOpenChange(o: boolean): void; onSend(r: NetRequest): void }) {
  const [r, setR] = useState<NetRequest>({ method: "GET", url: "", headers: [], body: "", timeout: 30000 });
  useEffect(() => {
    if (open) setR(prefill ? { ...prefill, headers: prefill.headers.length ? prefill.headers : [] } : { method: "GET", url: "https://", headers: [["Accept", "application/json"]], body: "", timeout: 30000 });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const urlOk = /^https?:\/\/[^\s]+$/i.test(r.url) || /^\/?[\w.~/%-]+(\?[^\s]*)?$/.test(r.url);
  const bodyAllowed = !["GET", "HEAD"].includes(r.method);
  const forbidden = r.headers.filter(([k]) => /^(cookie|host|origin|referer|content-length|connection|user-agent)$/i.test(k.trim()) || /^(proxy-|sec-)/i.test(k.trim()));
  const send = () => {
    if (!urlOk) return;
    onSend({ ...r, headers: r.headers.filter(([k]) => k.trim()), body: bodyAllowed ? r.body : "" });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Nova requisição</DialogTitle>
          <DialogDescription className="leading-relaxed">
            Enviada de dentro do preview, como a sua página faria: vale CORS, a origem é <code className="font-code">null</code> e mocks ativos respondem no lugar da rede.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="flex gap-2">
            <select
              value={r.method}
              onChange={(e) => setR({ ...r, method: e.target.value })}
              aria-label="Método"
              className="h-10 rounded-lg border border-md-outline bg-transparent px-2 font-code text-[13px] text-md-on-surface outline-none focus:border-md-primary"
            >
              {METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <input
              autoFocus
              value={r.url}
              onChange={(e) => setR({ ...r, url: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="https://api.exemplo.com/v1/itens ou /dados.json"
              aria-label="URL"
              spellCheck={false}
              className={cn("h-10 min-w-0 flex-1 rounded-lg border bg-transparent px-3 font-code text-[13px] text-md-on-surface outline-none focus:border-md-primary", urlOk ? "border-md-outline" : "border-[var(--rose)]")}
            />
          </div>
          <div>
            <div className="mb-1 flex items-center text-[12px] text-md-on-variant">
              Cabeçalhos
              <button className="md-btn md-btn-text ml-auto h-7 px-2 text-[12px]" onClick={() => setR({ ...r, headers: [...r.headers, ["", ""]] })}>
                <Icon name="add" size={16} /> Adicionar
              </button>
            </div>
            <div className="grid gap-1.5">
              {r.headers.map(([k, v], i) => (
                <div key={i} className="flex gap-1.5">
                  <input
                    value={k}
                    placeholder="Nome"
                    aria-label="Nome do cabeçalho"
                    onChange={(e) => setR({ ...r, headers: r.headers.map((h, j) => (j === i ? [e.target.value, h[1]] : h)) })}
                    className="h-8 w-44 rounded-lg border border-md-outline-v bg-transparent px-2 font-code text-[12px] text-md-on-surface outline-none focus:border-md-primary"
                  />
                  <input
                    value={v}
                    placeholder="Valor"
                    aria-label="Valor do cabeçalho"
                    type={isSecretHeader(k.trim()) ? "password" : "text"}
                    onChange={(e) => setR({ ...r, headers: r.headers.map((h, j) => (j === i ? [h[0], e.target.value] : h)) })}
                    className="h-8 min-w-0 flex-1 rounded-lg border border-md-outline-v bg-transparent px-2 font-code text-[12px] text-md-on-surface outline-none focus:border-md-primary"
                  />
                  <IconButton icon="close" label="Remover cabeçalho" size="sm" onClick={() => setR({ ...r, headers: r.headers.filter((_, j) => j !== i) })} />
                </div>
              ))}
            </div>
            {forbidden.length > 0 && (
              <div className="mt-1 text-[11.5px] text-[var(--amber)]">O navegador ignora {forbidden.map(([k]) => k).join(", ")} em requisições de páginas.</div>
            )}
          </div>
          {bodyAllowed && (
            <label className="grid gap-1 text-[12px] text-md-on-variant">
              Corpo
              <textarea
                value={r.body}
                onChange={(e) => setR({ ...r, body: e.target.value })}
                rows={6}
                spellCheck={false}
                placeholder='{"nome": "valor"}'
                className="rounded-lg border border-md-outline-v bg-transparent px-3 py-2 font-code text-[12.5px] text-md-on-surface outline-none focus:border-md-primary"
              />
            </label>
          )}
          <div className="text-[11.5px] leading-relaxed text-md-on-variant">
            Tokens digitados aqui ficam só na memória desta aba e aparecem mascarados no registro. Cookies não são enviados (credentials: omit).
          </div>
        </div>
        <DialogFooter>
          <button className="md-btn md-btn-text" onClick={() => onOpenChange(false)}>
            Cancelar
          </button>
          <button className="md-btn md-btn-filled" disabled={!urlOk} onClick={send}>
            <Icon name="send" size={18} /> Enviar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- mocks ---------------- */

const blankMock = (n: number): MockRule => ({ id: `mock-${n}`, enabled: true, method: "GET", url: "/api/exemplo", status: 200, headers: {}, body: { ok: true }, delay: 0, error: null });

export function MocksDialog({
  open,
  config,
  errors,
  files,
  onOpenChange,
  onSave,
  onOpenFile,
}: {
  open: boolean;
  config: MocksConfig | null;
  errors: string[];
  files: string[];
  onOpenChange(o: boolean): void;
  onSave(c: MocksConfig): void;
  onOpenFile(): void;
}) {
  const [c, setC] = useState<MocksConfig>({ version: 1, enabled: true, mocks: [] });
  const [edit, setEdit] = useState<number | null>(null);
  const [bodyText, setBodyText] = useState("");
  const [bodyErr, setBodyErr] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setC(config ? structuredClone(config) : { version: 1, enabled: true, mocks: [] });
      setEdit(null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = edit !== null ? c.mocks[edit] : null;
  useEffect(() => {
    if (m) {
      setBodyText(m.body === undefined ? "" : typeof m.body === "string" ? m.body : JSON.stringify(m.body, null, 2));
      setBodyErr(null);
    }
  }, [edit]); // eslint-disable-line react-hooks/exhaustive-deps
  const upd = (patch: Partial<MockRule>) => edit !== null && setC({ ...c, mocks: c.mocks.map((x, i) => (i === edit ? { ...x, ...patch } : x)) });
  const commitBody = (t: string) => {
    setBodyText(t);
    if (!t.trim()) return upd({ body: undefined }), setBodyErr(null);
    try {
      upd({ body: JSON.parse(t) });
      setBodyErr(null);
    } catch {
      upd({ body: t });
      setBodyErr("Não é JSON: será enviado como texto.");
    }
  };
  const field = "h-9 rounded-lg border border-md-outline-v bg-transparent px-2 font-code text-[12.5px] text-md-on-surface outline-none focus:border-md-primary";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[86vh] max-w-[860px] flex-col">
        <DialogHeader>
          <DialogTitle>Mocks</DialogTitle>
          <DialogDescription className="leading-relaxed">
            Respostas simuladas para fetch e XHR do preview — funcionam sem internet. Ficam em <code className="font-code">poiesis.mocks.json</code>, no projeto (entram no histórico e na pasta vinculada).
          </DialogDescription>
        </DialogHeader>
        {errors.length > 0 && (
          <div className="rounded-lg border-l-4 border-[var(--rose)] bg-md-high px-3 py-2 text-[12px] text-md-on-surface">
            {errors.slice(0, 5).map((e, i) => (
              <div key={i}>{e}</div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3 text-[13px]">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={c.enabled} onChange={(e) => setC({ ...c, enabled: e.target.checked })} /> Mocks ativos
          </label>
          <div className="flex-1" />
          <button className="md-btn md-btn-text h-8 text-[12.5px]" onClick={onOpenFile}>
            <Icon name="data_object" size={17} /> Editar o JSON
          </button>
          <button
            className="md-btn md-btn-tonal h-8 text-[12.5px]"
            onClick={() => {
              setC({ ...c, mocks: [...c.mocks, blankMock(c.mocks.length + 1)] });
              setEdit(c.mocks.length);
            }}
          >
            <Icon name="add" size={17} /> Novo mock
          </button>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)] gap-4 overflow-hidden">
          <div className="min-h-0 overflow-y-auto rounded-xl border border-md-outline-v">
            {!c.mocks.length && <div className="p-4 text-[12.5px] text-md-on-variant">Nenhum mock. Crie um aqui ou use "Criar mock" numa resposta do painel Rede.</div>}
            {c.mocks.map((x, i) => (
              <div key={i} data-on={edit === i} className="md-item h-auto items-center gap-2 rounded-none px-3 py-2" onClick={() => setEdit(i)} role="button" tabIndex={0}>
                <input
                  type="checkbox"
                  checked={x.enabled}
                  aria-label={`Ativar ${x.id}`}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setC({ ...c, mocks: c.mocks.map((y, j) => (j === i ? { ...y, enabled: e.target.checked } : y)) })}
                />
                <span className="w-14 font-code text-[11.5px] text-md-on-variant">{x.method}</span>
                <span className="min-w-0 flex-1 truncate font-code text-[12px] text-md-on-surface">{x.url}</span>
                <span className="font-code text-[11.5px] text-md-on-variant">{x.error ? (x.error === "timeout" ? "timeout" : "falha") : x.status}</span>
                <IconButton
                  icon="delete"
                  label="Apagar mock"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setC({ ...c, mocks: c.mocks.filter((_, j) => j !== i) });
                    setEdit(null);
                  }}
                />
              </div>
            ))}
          </div>
          <div className="min-h-0 overflow-y-auto pr-1">
            {!m && <div className="p-4 text-[12.5px] text-md-on-variant">Escolha um mock para editar.</div>}
            {m && (
              <div className="grid gap-2.5 text-[12px] text-md-on-variant">
                <div className="flex gap-2">
                  <label className="grid gap-1">
                    Método
                    <select value={m.method} onChange={(e) => upd({ method: e.target.value })} className={field}>
                      {["*", ...METHODS].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid min-w-0 flex-1 gap-1">
                    URL ou padrão
                    <input value={m.url} onChange={(e) => upd({ url: e.target.value })} spellCheck={false} className={field} placeholder="/api/usuarios/* ou https://api.site.com/**" />
                  </label>
                </div>
                <div className="text-[11.5px] leading-snug">
                  <code className="font-code">*</code> vale um trecho sem <code className="font-code">/</code>; <code className="font-code">**</code> vale qualquer coisa. Sem <code className="font-code">?</code> no padrão, a query é ignorada.
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="grid w-24 gap-1">
                    Status
                    <input type="number" min={100} max={599} value={m.status} onChange={(e) => upd({ status: Math.min(599, Math.max(100, Number(e.target.value) || 200)) })} className={field} />
                  </label>
                  <label className="grid w-28 gap-1">
                    Latência (ms)
                    <input type="number" min={0} max={30000} step={100} value={m.delay} onChange={(e) => upd({ delay: Math.min(30000, Math.max(0, Number(e.target.value) || 0)) })} className={field} />
                  </label>
                  <label className="grid flex-1 gap-1">
                    Simular
                    <select value={m.error ?? ""} onChange={(e) => upd({ error: (e.target.value || null) as MockRule["error"] })} className={field}>
                      <option value="">Resposta normal</option>
                      <option value="network">Falha de rede</option>
                      <option value="timeout">Timeout</option>
                    </select>
                  </label>
                  <label className="grid w-32 gap-1">
                    Identificador
                    <input value={m.id} onChange={(e) => upd({ id: e.target.value.replace(/[^\w-]/g, "").slice(0, 64) })} className={field} />
                  </label>
                </div>
                <label className="grid gap-1">
                  Corpo vindo de um arquivo do projeto (fixture)
                  <select value={m.bodyFile ?? ""} onChange={(e) => upd({ bodyFile: e.target.value || undefined })} className={field}>
                    <option value="">— corpo escrito abaixo —</option>
                    {files.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </label>
                {!m.bodyFile && (
                  <label className="grid gap-1">
                    Corpo (JSON ou texto)
                    <textarea value={bodyText} onChange={(e) => commitBody(e.target.value)} rows={8} spellCheck={false} className={cn(field, "h-auto py-2")} />
                    {bodyErr && <span className="text-[11.5px] text-[var(--amber)]">{bodyErr}</span>}
                  </label>
                )}
                <label className="grid gap-1">
                  Cabeçalhos da resposta — um por linha: <code className="font-code">Nome: valor</code>
                  <textarea
                    defaultValue={Object.entries(m.headers)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join("\n")}
                    key={edit}
                    onBlur={(e) =>
                      upd({
                        headers: Object.fromEntries(
                          e.target.value
                            .split("\n")
                            .map((l) => [l.slice(0, l.indexOf(":")).trim(), l.slice(l.indexOf(":") + 1).trim()])
                            .filter(([k]) => /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(k))
                        ),
                      })
                    }
                    rows={3}
                    spellCheck={false}
                    className={cn(field, "h-auto py-2")}
                  />
                </label>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <button className="md-btn md-btn-text" onClick={() => onOpenChange(false)}>
            Cancelar
          </button>
          <button
            className="md-btn md-btn-filled"
            onClick={() => {
              onSave(c);
              onOpenChange(false);
            }}
          >
            Salvar mocks
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
