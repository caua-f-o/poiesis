// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/* Editor das fixtures do chrome.* simulado (poiesis.chrome.json). */
import { useEffect, useState } from "react";
import { CHROME_FILE, TARGET_LABEL, type ChromeFixtures, type ChromeTab, type Json, type Target } from "@/lib/ext/fixtures";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "./Icon";
import { cn } from "@/lib/utils";

interface Row {
  id: string;
  enabled: boolean;
  to: Target;
  match: string;
  response: string;
  error: string;
  delay: number;
  extensionId: string;
}

const pretty = (v: unknown) => JSON.stringify(v ?? null, null, 2);

function parseObj(text: string, label: string): { v?: { [k: string]: Json }; err?: string } {
  try {
    const v = JSON.parse(text.trim() || "{}");
    if (!v || typeof v !== "object" || Array.isArray(v)) return { err: `${label}: precisa ser um objeto { … }.` };
    return { v };
  } catch (e) {
    return { err: `${label}: JSON inválido (${String((e as Error).message).replace(/^JSON\.parse: /, "")}).` };
  }
}

export function ChromeSimDialog({
  open,
  onOpenChange,
  config,
  fileErrors,
  current,
  onSave,
  onOpenFile,
}: {
  open: boolean;
  onOpenChange(o: boolean): void;
  config: ChromeFixtures;
  fileErrors: string[];
  /** estado atual do chrome.storage simulado no preview */
  current: { local?: Record<string, unknown>; sync?: Record<string, unknown> } | null;
  onSave(c: ChromeFixtures, resetStorage: boolean): void;
  onOpenFile(): void;
}) {
  const [local, setLocal] = useState("{}");
  const [sync, setSync] = useState("{}");
  const [tabs, setTabs] = useState<ChromeTab[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [reset, setReset] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setLocal(pretty(config.storage.local));
    setSync(pretty(config.storage.sync));
    setTabs(config.tabs.map((t) => ({ ...t })));
    setRows(
      config.messages.map((m) => ({
        id: m.id,
        enabled: m.enabled,
        to: m.to,
        match: pretty(m.match),
        response: pretty(m.response),
        error: m.error ?? "",
        delay: m.delay,
        extensionId: m.extensionId ?? "",
      }))
    );
    setErrors([]);
    setReset(true);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    const errs: string[] = [];
    const l = parseObj(local, "storage.local");
    const s = parseObj(sync, "storage.sync");
    if (l.err) errs.push(l.err);
    if (s.err) errs.push(s.err);
    if (s.v && JSON.stringify(s.v).length > 102400) errs.push("storage.sync passa da cota real do Chrome (100 KB).");
    const ids = new Set<string>();
    const messages = rows.map((r, i) => {
      const where = `Resposta ${i + 1}`;
      const id = r.id.trim() || `resposta-${i + 1}`;
      if (!/^[\w-]{1,40}$/.test(id)) errs.push(`${where}: o id usa só letras, números, - e _.`);
      if (ids.has(id)) errs.push(`${where}: id repetido.`);
      ids.add(id);
      const m = parseObj(r.match, `${where} (mensagem)`);
      if (m.err) errs.push(m.err);
      let response: Json = null;
      try {
        response = JSON.parse(r.response.trim() || "null");
      } catch {
        errs.push(`${where}: a resposta precisa ser JSON.`);
      }
      return { id, enabled: r.enabled, to: r.to, match: m.v ?? {}, response, error: r.error.trim() || null, delay: Math.max(0, Math.min(30000, Math.round(r.delay) || 0)), ...(r.to === "external" && r.extensionId.trim() ? { extensionId: r.extensionId.trim() } : {}) };
    });
    const badTab = tabs.findIndex((t) => !/^(https?|file):\/\//i.test(t.url));
    if (badTab >= 0) errs.push(`Aba ${badTab + 1}: a URL precisa começar com http://, https:// ou file://.`);
    setErrors(errs);
    if (errs.length) return;
    onSave({ version: 1, storage: { local: l.v!, sync: s.v! }, tabs, messages }, reset);
  };

  const area = "md-field h-auto min-h-[64px] w-full py-2 font-code text-[12px]";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[720px]" data-pz="chrome-sim">
        <DialogHeader>
          <DialogTitle>Simulação do chrome.*</DialogTitle>
          <DialogDescription>
            Dados de teste para o preview, guardados em <code className="font-code">{CHROME_FILE}</code> (entram no histórico, mas ficam fora do ZIP). Nada disso roda na extensão instalada.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[62vh] gap-4 overflow-y-auto pr-1">
          {fileErrors.length > 0 && (
            <div role="alert" className="rounded-xl bg-[color-mix(in_oklab,var(--amber)_14%,transparent)] px-3 py-2 text-[12px] text-md-on-surface">
              {fileErrors.join(" · ")}
            </div>
          )}

          <section className="grid gap-2">
            <h3 className="flex items-center gap-2 text-[13px] font-semibold text-md-on-surface">
              <Icon name="database" size={18} className="text-md-primary" /> chrome.storage inicial
            </h3>
            <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))]">
              <label className="grid gap-1">
                <span className="text-[12px] text-md-on-variant">local</span>
                <textarea className={area} aria-label="storage.local inicial" value={local} onChange={(e) => setLocal(e.target.value)} />
              </label>
              <label className="grid gap-1">
                <span className="text-[12px] text-md-on-variant">sync</span>
                <textarea className={area} aria-label="storage.sync inicial" value={sync} onChange={(e) => setSync(e.target.value)} />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                className="md-btn md-btn-text h-8 text-[12.5px]"
                disabled={!current}
                onClick={() => {
                  setLocal(pretty(current?.local ?? {}));
                  setSync(pretty(current?.sync ?? {}));
                }}
              >
                <Icon name="download" size={16} /> Copiar o estado atual do preview
              </button>
              <label className="flex items-center gap-2 text-[12.5px] text-md-on-surface">
                <input type="checkbox" checked={reset} onChange={(e) => setReset(e.target.checked)} /> Ao salvar, recomeçar o preview com estes dados
              </label>
            </div>
          </section>

          <section className="grid gap-2">
            <h3 className="flex items-center gap-2 text-[13px] font-semibold text-md-on-surface">
              <Icon name="tab" size={18} className="text-md-primary" /> Abas fictícias (tabs.query)
            </h3>
            {tabs.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="radio" name="aba-ativa" aria-label={`Aba ${i + 1} ativa`} checked={t.active} onChange={() => setTabs(tabs.map((x, j) => ({ ...x, active: i === j })))} />
                <input className="md-field min-w-0 flex-[2] font-code text-[12px]" aria-label={`URL da aba ${i + 1}`} value={t.url} onChange={(e) => setTabs(tabs.map((x, j) => (i === j ? { ...x, url: e.target.value } : x)))} />
                <input className="md-field min-w-0 flex-1 text-[12px]" aria-label={`Título da aba ${i + 1}`} value={t.title} onChange={(e) => setTabs(tabs.map((x, j) => (i === j ? { ...x, title: e.target.value } : x)))} />
                <button className="md-icon-btn xs" aria-label={`Remover aba ${i + 1}`} onClick={() => setTabs(tabs.filter((_, j) => j !== i))}>
                  <Icon name="close" size={16} />
                </button>
              </div>
            ))}
            <div>
              <button className="md-btn md-btn-text h-8 text-[12.5px]" onClick={() => setTabs([...tabs, { url: "https://example.com/", title: "Exemplo", active: !tabs.length }])}>
                <Icon name="add" size={16} /> Adicionar aba
              </button>
            </div>
          </section>

          <section className="grid gap-2">
            <h3 className="flex items-center gap-2 text-[13px] font-semibold text-md-on-surface">
              <Icon name="forum" size={18} className="text-md-primary" /> Respostas simuladas
            </h3>
            <p className="text-[12px] leading-snug text-md-on-variant">
              Quando a página manda uma mensagem que contém os campos de “mensagem”, o preview responde com a “resposta” (ou falha com o erro). A primeira que casar vale. Sem resposta simulada, a mensagem falha como no
              Chrome sem ninguém escutando.
            </p>
            {rows.map((r, i) => (
              <div key={i} className={cn("grid gap-2 rounded-xl border border-md-outline-v p-3", !r.enabled && "opacity-60")}>
                <div className="flex flex-wrap items-center gap-2">
                  <input type="checkbox" aria-label={`Resposta ${i + 1} ligada`} checked={r.enabled} onChange={(e) => setRows(rows.map((x, j) => (i === j ? { ...x, enabled: e.target.checked } : x)))} />
                  <input className="md-field h-8 w-36 font-code text-[12px]" aria-label={`Id da resposta ${i + 1}`} value={r.id} onChange={(e) => setRows(rows.map((x, j) => (i === j ? { ...x, id: e.target.value } : x)))} />
                  <select className="md-field h-8 min-w-0 flex-1 text-[12px]" aria-label={`Destino da resposta ${i + 1}`} value={r.to} onChange={(e) => setRows(rows.map((x, j) => (i === j ? { ...x, to: e.target.value as Target } : x)))}>
                    {(Object.keys(TARGET_LABEL) as Target[]).map((k) => (
                      <option key={k} value={k}>
                        {TARGET_LABEL[k]}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-[12px] text-md-on-variant">
                    atraso
                    <input type="number" min={0} max={30000} step={100} className="md-field h-8 w-20 text-[12px]" aria-label={`Atraso da resposta ${i + 1}`} value={r.delay} onChange={(e) => setRows(rows.map((x, j) => (i === j ? { ...x, delay: +e.target.value } : x)))} />
                    ms
                  </label>
                  <button className="md-icon-btn xs" aria-label={`Remover resposta ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                    <Icon name="delete" size={16} />
                  </button>
                </div>
                {r.to === "external" && (
                  <input className="md-field h-8 font-code text-[12px]" aria-label={`ID de destino da resposta ${i + 1}`} placeholder="ID da extensão de destino (vazio = qualquer)" value={r.extensionId} onChange={(e) => setRows(rows.map((x, j) => (i === j ? { ...x, extensionId: e.target.value } : x)))} />
                )}
                <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]">
                  <label className="grid gap-1">
                    <span className="text-[11.5px] text-md-on-variant">Mensagem contém</span>
                    <textarea className={area} aria-label={`Mensagem da resposta ${i + 1}`} value={r.match} onChange={(e) => setRows(rows.map((x, j) => (i === j ? { ...x, match: e.target.value } : x)))} />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-[11.5px] text-md-on-variant">Resposta (JSON)</span>
                    <textarea className={area} aria-label={`Resposta ${i + 1}`} value={r.response} onChange={(e) => setRows(rows.map((x, j) => (i === j ? { ...x, response: e.target.value } : x)))} />
                  </label>
                </div>
                <input className="md-field h-8 text-[12px]" aria-label={`Erro da resposta ${i + 1}`} placeholder="Ou falhar com este erro (opcional)" value={r.error} onChange={(e) => setRows(rows.map((x, j) => (i === j ? { ...x, error: e.target.value } : x)))} />
              </div>
            ))}
            <div>
              <button
                className="md-btn md-btn-text h-8 text-[12.5px]"
                onClick={() => setRows([...rows, { id: `resposta-${rows.length + 1}`, enabled: true, to: "runtime", match: '{\n  "tipo": "exemplo"\n}', response: '{\n  "ok": true\n}', error: "", delay: 0, extensionId: "" }])}
              >
                <Icon name="add" size={16} /> Adicionar resposta
              </button>
            </div>
          </section>

          {errors.length > 0 && (
            <ul role="alert" className="grid gap-0.5 text-[12px] text-[var(--syn-invalid)]">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <button className="md-btn md-btn-text mr-auto" onClick={onOpenFile}>
            <Icon name="data_object" size={16} /> Abrir o JSON
          </button>
          <button className="md-btn md-btn-text" onClick={() => onOpenChange(false)}>
            Cancelar
          </button>
          <button className="md-btn md-btn-filled" onClick={save}>
            Salvar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
