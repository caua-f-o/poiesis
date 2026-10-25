// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/* Formulário do manifest.json, sincronizado com o JSON: cada mudança regrava o arquivo
 * pelo objeto inteiro, então campos que o formulário não conhece continuam lá. */
import { useMemo, useState, type ReactNode } from "react";
import type { PFile } from "@/lib/types";
import { editManifest, getAt, parseManifest, setAt, type JPath, type Json } from "@/lib/ext/manifest";
import { PERM, PERMISSIONS, hostRisk, isExtensionId, matchPatternError, type Risk } from "@/lib/ext/permissions";
import type { ExtFix, ExtProblem } from "@/lib/ext/validate";
import { Icon } from "./Icon";
import { cn } from "@/lib/utils";

const HANDLED = new Set([
  "manifest_version", "name", "short_name", "version", "version_name", "description", "default_locale", "minimum_chrome_version", "author", "homepage_url",
  "action", "icons", "background", "options_page", "options_ui", "side_panel", "content_scripts", "permissions", "optional_permissions", "host_permissions",
  "optional_host_permissions", "externally_connectable",
]);

export const RISK_TONE: Record<Risk, string> = {
  baixo: "bg-[color-mix(in_oklab,var(--verd)_18%,transparent)] text-[var(--verd)]",
  médio: "bg-[color-mix(in_oklab,var(--amber)_18%,transparent)] text-[var(--amber)]",
  alto: "bg-[color-mix(in_oklab,var(--rose)_18%,transparent)] text-[var(--rose)]",
};

export function RiskBadge({ risk }: { risk: Risk }) {
  return <span className={cn("shrink-0 rounded-full px-2 text-[10.5px] font-semibold uppercase tracking-wide", RISK_TONE[risk])}>risco {risk}</span>;
}

export const SEV_ICON = { error: "error", warning: "warning", info: "info" } as const;
export const SEV_TONE = { error: "text-[var(--syn-invalid)]", warning: "text-md-warn", info: "text-md-info" } as const;

interface Props {
  src: string;
  files: PFile[];
  problems: ExtProblem[];
  onChange(next: string): void;
  onJson(path?: JPath): void;
  onIcons(): void;
  onFix(fix: ExtFix): void;
  onCreateFile(name: string): void;
}

function Section({ icon, title, hint, children, id }: { icon: string; title: string; hint?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="md-card-outlined rounded-2xl p-4" aria-labelledby={id}>
      <h2 id={id} className="mb-1 flex items-center gap-2 text-[14px] font-semibold text-md-on-surface">
        <Icon name={icon} size={19} className="text-md-primary" /> {title}
      </h2>
      {hint && <p className="mb-3 text-[12px] leading-snug text-md-on-variant">{hint}</p>}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3">{children}</div>
    </section>
  );
}

function Field({ label, hint, children, error }: { label: string; hint?: ReactNode; children: ReactNode; error?: string | null }) {
  return (
    <label className="grid min-w-0 gap-1">
      <span className="text-[12px] font-medium text-md-on-variant">{label}</span>
      {children}
      {error ? <span className="text-[11.5px] text-[var(--syn-invalid)]">{error}</span> : hint ? <span className="text-[11.5px] leading-snug text-md-outline">{hint}</span> : null}
    </label>
  );
}

export function ManifestForm({ src, files, problems, onChange, onJson, onIcons, onFix, onCreateFile }: Props) {
  const { data: m, error } = useMemo(() => parseManifest(src), [src]);
  const htmls = files.filter((f) => f.kind === "html").map((f) => f.name);
  const jss = files.filter((f) => f.kind === "js").map((f) => f.name);
  const csss = files.filter((f) => f.kind === "css").map((f) => f.name);
  const pngs = files.filter((f) => f.kind === "asset" && /^image\//.test(f.mime ?? "")).map((f) => f.name);

  if (!m)
    return (
      <div className="mx-auto max-w-[720px] p-6" data-pz="manifest-form">
        <div role="alert" className="md-card-outlined flex items-start gap-3 rounded-2xl p-4">
          <Icon name="error" size={22} fill className="mt-0.5 text-[var(--syn-invalid)]" />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-md-on-surface">O formulário precisa de um JSON válido</div>
            <div className="mt-1 font-code text-[12px] text-md-on-variant">{error}</div>
            <button className="md-btn md-btn-filled mt-3 h-8" onClick={() => onJson()}>
              <Icon name="data_object" size={17} /> Corrigir no JSON
            </button>
          </div>
        </div>
      </div>
    );

  const set = (path: JPath, value: Json) => {
    const next = editManifest(src, (x) => setAt(x, path, value === "" ? undefined : value));
    if (next != null && next !== src) onChange(next);
  };
  const mut = (fn: (x: Json) => void) => {
    const next = editManifest(src, fn);
    if (next != null && next !== src) onChange(next);
  };
  const v = (path: JPath) => {
    const x = getAt(m, path);
    return typeof x === "string" || typeof x === "number" ? String(x) : "";
  };
  const text = (path: JPath, opts: { placeholder?: string; mono?: boolean; label: string; max?: number }) => (
    <input
      className={cn("md-field w-full", opts.mono && "font-code")}
      aria-label={opts.label}
      value={v(path)}
      placeholder={opts.placeholder}
      maxLength={opts.max ? opts.max + 40 : undefined}
      onChange={(e) => set(path, e.target.value)}
    />
  );
  const fileSelect = (path: JPath, options: string[], label: string, none = "— nenhum —") => {
    const cur = v(path);
    const list = cur && !options.includes(cur) ? [cur, ...options] : options;
    return (
      <select className="md-field w-full min-w-0 font-code" aria-label={label} value={cur} onChange={(e) => set(path, e.target.value)}>
        <option value="">{none}</option>
        {list.map((o) => (
          <option key={o} value={o}>
            {o}
            {!options.includes(o) ? "  (não existe)" : ""}
          </option>
        ))}
      </select>
    );
  };

  const mProblems = problems.filter((p) => p.file === "manifest.json");
  const actionKey = m.action ? "action" : "action";
  const perms: string[] = Array.isArray(m.permissions) ? m.permissions : [];
  const optPerms: string[] = Array.isArray(m.optional_permissions) ? m.optional_permissions : [];
  const hosts: string[] = Array.isArray(m.host_permissions) ? m.host_permissions : [];
  const cs: Json[] = Array.isArray(m.content_scripts) ? m.content_scripts : [];
  const ec = m.externally_connectable && typeof m.externally_connectable === "object" ? m.externally_connectable : null;
  const others = Object.keys(m).filter((k) => !HANDLED.has(k));
  const optionsPath: JPath = m.options_ui ? ["options_ui", "page"] : m.options_page ? ["options_page"] : ["options_ui", "page"];
  const iconOf = (size: string) => {
    const p = getAt(m, ["icons", size]);
    return typeof p === "string" ? files.find((f) => f.name === p) : undefined;
  };

  return (
    <div className="h-full overflow-y-auto" data-pz="manifest-form">
      <div className="mx-auto grid max-w-[760px] grid-cols-[minmax(0,1fr)] gap-4 p-5 pb-16">
        {mProblems.length > 0 && (
          <div className="md-card-outlined rounded-2xl p-3" role="region" aria-label="Problemas do manifesto">
            <ul className="grid gap-1">
              {mProblems.slice(0, 12).map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-[12.5px] leading-snug">
                  <Icon name={SEV_ICON[p.sev]} size={17} fill className={cn("mt-px shrink-0", SEV_TONE[p.sev])} />
                  <span className="min-w-0 flex-1 text-md-on-surface">{p.msg}</span>
                  {p.fix && (
                    <button className="md-btn md-btn-tonal h-7 shrink-0 px-2.5 text-[12px]" onClick={() => onFix(p.fix!)}>
                      <Icon name="auto_fix_high" size={15} /> {p.fix.label}
                    </button>
                  )}
                  {p.jpath && (
                    <button className="md-icon-btn xs shrink-0" aria-label="Ver no JSON" title="Ver no JSON" onClick={() => onJson(p.jpath)}>
                      <Icon name="data_object" size={16} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Section icon="badge" title="Identidade" id="sec-id">
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
            <Field label="Nome" hint={`${v(["name"]).length}/75 · aparece na barra, no menu e na loja`}>
              {text(["name"], { label: "Nome", max: 75 })}
            </Field>
            <Field label="Versão" hint="Ex.: 1.0.0 — suba a cada publicação">
              {text(["version"], { label: "Versão", mono: true, placeholder: "1.0.0" })}
            </Field>
          </div>
          <Field label="Descrição" hint={`${v(["description"]).length}/132`}>
            <textarea className="md-field h-auto min-h-[60px] w-full py-2" aria-label="Descrição" value={v(["description"])} onChange={(e) => set(["description"], e.target.value)} />
          </Field>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))]">
            <Field label="Nome curto">{text(["short_name"], { label: "Nome curto", placeholder: "opcional" })}</Field>
            <Field label="Idioma padrão" hint="Com pasta _locales">
              {text(["default_locale"], { label: "Idioma padrão", mono: true, placeholder: "pt_BR" })}
            </Field>
            <Field label="Chrome mínimo">{text(["minimum_chrome_version"], { label: "Chrome mínimo", mono: true, placeholder: "ex.: 116" })}</Field>
          </div>
        </Section>

        <Section icon="ads_click" title="Botão da extensão e popup" hint="O popup abre ao clicar no ícone da extensão na barra. Sem popup, o clique dispara chrome.action.onClicked no service worker.">
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]">
            <Field label="Popup (página HTML)">{fileSelect([actionKey, "default_popup"], htmls, "Popup")}</Field>
            <Field label="Título (dica ao passar o mouse)">{text([actionKey, "default_title"], { label: "Título da ação" })}</Field>
          </div>
        </Section>

        <Section icon="image" title="Ícones" hint="PNG quadrado. A loja exige 128×128; o Chrome usa 16 e 32 na barra e 48 em chrome://extensions.">
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))]">
            {["16", "32", "48", "128"].map((s) => {
              const f = iconOf(s);
              return (
                <Field key={s} label={`${s}×${s}`}>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-md-high">
                      {f ? <img src={f.content} alt="" className="max-h-8 max-w-8" style={{ imageRendering: +s <= 32 ? "pixelated" : "auto" }} /> : <Icon name="hide_image" size={18} className="text-md-outline" />}
                    </span>
                    {fileSelect(["icons", s], pngs, `Ícone ${s}`, "—")}
                  </div>
                </Field>
              );
            })}
          </div>
          <div>
            <button className="md-btn md-btn-tonal h-8" onClick={onIcons}>
              <Icon name="auto_awesome" size={17} /> Gerar ícones a partir de uma imagem…
            </button>
          </div>
        </Section>

        <Section icon="settings_suggest" title="Service worker (fundo)" hint="Roda separado das páginas, sem DOM, e dorme quando não tem trabalho. Não roda no preview: teste com a extensão instalada.">
          <div className="grid items-end gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
            <Field label="Arquivo">{fileSelect(["background", "service_worker"], jss, "Service worker")}</Field>
            <label className="flex h-9 items-center gap-2 text-[12.5px] text-md-on-surface">
              <input type="checkbox" checked={getAt(m, ["background", "type"]) === "module"} disabled={!v(["background", "service_worker"])} onChange={(e) => set(["background", "type"], e.target.checked ? "module" : undefined)} />
              Módulo ES (permite import)
            </label>
          </div>
        </Section>

        <Section icon="web" title="Páginas">
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]">
            <Field label="Opções" hint="Aberta por chrome.runtime.openOptionsPage() e pelo menu da extensão">
              {fileSelect(optionsPath, htmls, "Página de opções")}
            </Field>
            <Field label="Painel lateral" hint="Precisa da permissão sidePanel (Chrome 114+)">
              {fileSelect(["side_panel", "default_path"], htmls, "Painel lateral")}
            </Field>
          </div>
          {m.options_ui && (
            <label className="flex items-center gap-2 text-[12.5px] text-md-on-surface">
              <input type="checkbox" checked={getAt(m, ["options_ui", "open_in_tab"]) === true} onChange={(e) => set(["options_ui", "open_in_tab"], e.target.checked)} />
              Abrir as opções numa aba (desligado: janelinha em chrome://extensions)
            </label>
          )}
        </Section>

        <Section icon="code_blocks" title="Content scripts" hint="Rodam dentro das páginas dos sites de “matches”. Veem o DOM, mas num mundo isolado. Não rodam no preview.">
          {cs.map((c, i) => (
            <ContentScript key={i} i={i} c={c} jss={jss} csss={csss} set={set} remove={() => mut((x) => { x.content_scripts.splice(i, 1); if (!x.content_scripts.length) delete x.content_scripts; })} onCreate={onCreateFile} />
          ))}
          <div>
            <button
              className="md-btn md-btn-text h-8"
              onClick={() => mut((x) => { x.content_scripts = [...(Array.isArray(x.content_scripts) ? x.content_scripts : []), { matches: ["https://example.com/*"], js: [jss.includes("content.js") ? "content.js" : jss[0] ?? "content.js"] }]; })}
            >
              <Icon name="add" size={17} /> Adicionar content script
            </button>
          </div>
        </Section>

        <PermissionsSection perms={perms} optPerms={optPerms} hosts={hosts} mut={mut} />

        <Section icon="hub" title="Comunicação com outras extensões" hint="externally_connectable diz quem pode mandar mensagens para esta extensão (chrome.runtime.sendMessage com o ID dela). Sem esta chave, qualquer extensão pode; com ela, só as listadas.">
          {ec ? (
            <IdList
              ids={Array.isArray(ec.ids) ? ec.ids : []}
              onAdd={(id) => mut((x) => { x.externally_connectable.ids = [...(Array.isArray(x.externally_connectable.ids) ? x.externally_connectable.ids : []), id]; })}
              onRemove={(i) => mut((x) => { x.externally_connectable.ids.splice(i, 1); })}
            />
          ) : (
            <div>
              <button className="md-btn md-btn-text h-8" onClick={() => set(["externally_connectable"], { ids: [] })}>
                <Icon name="lock" size={17} /> Restringir a extensões autorizadas
              </button>
            </div>
          )}
        </Section>

        {others.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-1 text-[12px] text-md-on-variant">
            <Icon name="data_object" size={16} /> Outros campos, preservados no JSON:
            {others.map((k) => (
              <button key={k} className="md-chip h-6 px-2 font-code text-[11.5px]" onClick={() => onJson([k])}>
                {k}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ContentScript({ i, c, jss, csss, set, remove, onCreate }: { i: number; c: Json; jss: string[]; csss: string[]; set(p: JPath, v: Json): void; remove(): void; onCreate(n: string): void }) {
  const base: JPath = ["content_scripts", i];
  const matches: string[] = Array.isArray(c?.matches) ? c.matches : [];
  const js: string[] = Array.isArray(c?.js) ? c.js : [];
  const css: string[] = Array.isArray(c?.css) ? c.css : [];
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? matches.join("\n");
  const errs = shown.split("\n").map((l) => l.trim()).filter(Boolean).map(matchPatternError).filter(Boolean);
  const toggle = (key: "js" | "css", list: string[], name: string, on: boolean) => set([...base, key], on ? [...list, name] : list.filter((x) => x !== name).length ? list.filter((x) => x !== name) : undefined);
  return (
    <div className="rounded-xl border border-md-outline-v p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[12.5px] font-semibold text-md-on-surface">Content script {i + 1}</span>
        <span className="flex-1" />
        <button className="md-icon-btn xs" aria-label={`Remover content script ${i + 1}`} title="Remover" onClick={remove}>
          <Icon name="delete" size={17} />
        </button>
      </div>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]">
        <Field label="Páginas (matches), uma por linha" error={errs[0]}>
          <textarea
            className="md-field h-auto min-h-[64px] w-full py-2 font-code text-[12px]"
            aria-label={`Matches do content script ${i + 1}`}
            value={shown}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (draft == null) return;
              set([...base, "matches"], draft.split("\n").map((l) => l.trim()).filter(Boolean));
              setDraft(null);
            }}
          />
        </Field>
        <div className="grid gap-2">
          <Field label="Quando roda">
            <select className="md-field w-full" aria-label={`run_at do content script ${i + 1}`} value={c?.run_at ?? "document_idle"} onChange={(e) => set([...base, "run_at"], e.target.value === "document_idle" ? undefined : e.target.value)}>
              <option value="document_start">document_start — antes do HTML</option>
              <option value="document_end">document_end — com o DOM pronto</option>
              <option value="document_idle">document_idle — depois de carregar (padrão)</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 text-[12.5px] text-md-on-surface">
            <input type="checkbox" checked={c?.all_frames === true} onChange={(e) => set([...base, "all_frames"], e.target.checked || undefined)} /> Também dentro de iframes
          </label>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {[...new Set([...jss, ...js])].map((n) => (
          <label key={n} className="md-chip h-7 cursor-pointer gap-1 px-2 font-code text-[11.5px]" data-on={js.includes(n)}>
            <input type="checkbox" className="sr-only" checked={js.includes(n)} onChange={(e) => (jss.includes(n) || !e.target.checked ? toggle("js", js, n, e.target.checked) : onCreate(n))} />
            {js.includes(n) && <Icon name="check" size={14} />} {n}
          </label>
        ))}
        {[...new Set([...csss, ...css])].map((n) => (
          <label key={n} className="md-chip h-7 cursor-pointer gap-1 px-2 font-code text-[11.5px]" data-on={css.includes(n)}>
            <input type="checkbox" className="sr-only" checked={css.includes(n)} onChange={(e) => toggle("css", css, n, e.target.checked)} />
            {css.includes(n) && <Icon name="check" size={14} />} {n}
          </label>
        ))}
      </div>
    </div>
  );
}

function PermissionsSection({ perms, optPerms, hosts, mut }: { perms: string[]; optPerms: string[]; hosts: string[]; mut(fn: (x: Json) => void): void }) {
  const [adding, setAdding] = useState("");
  const [host, setHost] = useState("");
  const hostErr = host.trim() ? matchPatternError(host.trim()) : null;
  const all = [...perms.map((p) => ({ p, opt: false })), ...optPerms.map((p) => ({ p, opt: true }))];
  const available = PERMISSIONS.filter((p) => !perms.includes(p.name) && !optPerms.includes(p.name));
  return (
    <section className="md-card-outlined rounded-2xl p-4" aria-labelledby="sec-perm">
      <h2 id="sec-perm" className="mb-1 flex items-center gap-2 text-[14px] font-semibold text-md-on-surface">
        <Icon name="shield_person" size={19} className="text-md-primary" /> Permissões
      </h2>
      <p className="mb-3 text-[12px] leading-snug text-md-on-variant">
        <b>permissions</b> valem desde a instalação. <b>optional_permissions</b> são pedidas na hora, com chrome.permissions.request (melhor para o que nem todo mundo usa). <b>host_permissions</b> são os sites que a extensão
        pode ler e alterar. Peça o mínimo: cada permissão com aviso aparece para o usuário na instalação.
      </p>
      <ul className="grid gap-1.5" aria-label="Permissões declaradas">
        {all.map(({ p, opt }) => {
          const info = PERM.get(p);
          return (
            <li key={p + opt} className="flex items-start gap-2 rounded-xl bg-md-low px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-code text-[12.5px] font-semibold text-md-on-surface">{p}</span>
                  {info && <RiskBadge risk={info.risk} />}
                  {opt && <span className="rounded-full bg-md-high px-2 text-[10.5px] text-md-on-variant">opcional</span>}
                </div>
                <div className="text-[12px] leading-snug text-md-on-variant">{info?.desc ?? "Permissão que o Poiesis não conhece. Confira o nome."}</div>
                {info?.aviso && <div className="mt-0.5 text-[11.5px] text-md-outline">Aviso na instalação: “{info.aviso}”</div>}
              </div>
              <button
                className="md-btn md-btn-text h-7 shrink-0 px-2 text-[11.5px]"
                title={opt ? "Mover para permissions (valem desde a instalação)" : "Mover para optional_permissions (pedidas na hora)"}
                onClick={() =>
                  mut((x) => {
                    const from = opt ? "optional_permissions" : "permissions";
                    const to = opt ? "permissions" : "optional_permissions";
                    x[from] = (x[from] ?? []).filter((y: string) => y !== p);
                    if (!x[from].length) delete x[from];
                    x[to] = [...(Array.isArray(x[to]) ? x[to] : []), p];
                  })
                }
              >
                {opt ? "Tornar fixa" : "Tornar opcional"}
              </button>
              <button
                className="md-icon-btn xs shrink-0"
                aria-label={`Remover a permissão ${p}`}
                title="Remover"
                onClick={() =>
                  mut((x) => {
                    const key = opt ? "optional_permissions" : "permissions";
                    x[key] = (x[key] ?? []).filter((y: string) => y !== p);
                    if (!x[key].length) delete x[key];
                  })
                }
              >
                <Icon name="close" size={16} />
              </button>
            </li>
          );
        })}
        {!all.length && <li className="text-[12px] text-md-outline">Nenhuma permissão declarada.</li>}
      </ul>
      <div className="mt-2 flex gap-2">
        <select className="md-field min-w-0 flex-1" aria-label="Permissão para adicionar" value={adding} onChange={(e) => setAdding(e.target.value)}>
          <option value="">Adicionar permissão…</option>
          {available.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name} — {p.desc.slice(0, 70)}
            </option>
          ))}
        </select>
        <button
          className="md-btn md-btn-tonal h-9"
          disabled={!adding}
          onClick={() => {
            mut((x) => {
              x.permissions = [...(Array.isArray(x.permissions) ? x.permissions : []), adding];
            });
            setAdding("");
          }}
        >
          Adicionar
        </button>
      </div>

      <h3 className="mb-1 mt-4 text-[12.5px] font-semibold text-md-on-surface">Sites (host_permissions)</h3>
      <ul className="grid gap-1" aria-label="Sites com acesso">
        {hosts.map((h, i) => (
          <li key={h + i} className="flex items-center gap-2 rounded-xl bg-md-low px-3 py-1.5">
            <span className="min-w-0 flex-1 truncate font-code text-[12px] text-md-on-surface">{h}</span>
            <RiskBadge risk={hostRisk(h)} />
            <button
              className="md-icon-btn xs"
              aria-label={`Remover o site ${h}`}
              title="Remover"
              onClick={() =>
                mut((x) => {
                  x.host_permissions.splice(i, 1);
                  if (!x.host_permissions.length) delete x.host_permissions;
                })
              }
            >
              <Icon name="close" size={16} />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 grid gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          const h = host.trim();
          if (!h || hostErr) return;
          mut((x) => {
            x.host_permissions = [...new Set([...(Array.isArray(x.host_permissions) ? x.host_permissions : []), h])];
          });
          setHost("");
        }}
      >
        <div className="flex gap-2">
          <input className="md-field min-w-0 flex-1 font-code" aria-label="Novo site" placeholder="https://api.exemplo.com/*" value={host} onChange={(e) => setHost(e.target.value)} />
          <button className="md-btn md-btn-tonal h-9" disabled={!host.trim() || !!hostErr}>
            Adicionar
          </button>
        </div>
        {hostErr && <span className="text-[11.5px] text-[var(--syn-invalid)]">{hostErr}</span>}
      </form>
    </section>
  );
}

function IdList({ ids, onAdd, onRemove }: { ids: string[]; onAdd(id: string): void; onRemove(i: number): void }) {
  const [id, setId] = useState("");
  const t = id.trim();
  const err = t && t !== "*" && !isExtensionId(t) ? "Um ID tem 32 letras de a a p (copie de chrome://extensions)." : t && ids.includes(t) ? "Esse ID já está na lista." : null;
  return (
    <div className="grid gap-2">
      <ul className="grid gap-1" aria-label="IDs autorizados">
        {ids.map((x, i) => (
          <li key={x + i} className="flex items-center gap-2 rounded-xl bg-md-low px-3 py-1.5">
            <Icon name="extension" size={16} className="text-md-outline" />
            <span className="min-w-0 flex-1 truncate font-code text-[12px] text-md-on-surface">{x}</span>
            <button className="md-icon-btn xs" aria-label={`Remover o ID ${x}`} title="Remover" onClick={() => onRemove(i)}>
              <Icon name="close" size={16} />
            </button>
          </li>
        ))}
        {!ids.length && <li className="text-[12px] text-md-outline">Nenhum ID autorizado: nenhuma extensão consegue mandar mensagens.</li>}
      </ul>
      <form
        className="grid gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (!t || err) return;
          onAdd(t);
          setId("");
        }}
      >
        <div className="flex gap-2">
          <input className="md-field min-w-0 flex-1 font-code" aria-label="ID da extensão autorizada" placeholder="abcdefghijklmnopabcdefghijklmnop" value={id} onChange={(e) => setId(e.target.value)} />
          <button className="md-btn md-btn-tonal h-9" disabled={!t || !!err}>
            Autorizar
          </button>
        </div>
        {err && <span className="text-[11.5px] text-[var(--syn-invalid)]">{err}</span>}
      </form>
    </div>
  );
}
