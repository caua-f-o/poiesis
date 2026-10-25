// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/* Painel lateral "Extensão": estado do projeto de extensão, pontos de entrada,
 * problemas com correção, mapa de arquivos, permissões e exportação. */
import { useMemo, useState } from "react";
import type { Project } from "@/lib/types";
import type { ExtFix, ExtReport } from "@/lib/ext/validate";
import { extensionMap, type MapNode } from "@/lib/ext/map";
import { PAGE_ROLES, type Role } from "@/lib/ext/manifest";
import { BROAD_HOSTS, PERM } from "@/lib/ext/permissions";
import { Icon } from "./Icon";
import { PanelHeader } from "./md";
import { RiskBadge, SEV_ICON, SEV_TONE } from "./ManifestForm";
import { cn } from "@/lib/utils";

const ROLE_ICON: Record<string, string> = {
  popup: "ads_click",
  options: "settings",
  sidepanel: "right_panel_open",
  background: "settings_suggest",
  content: "code_blocks",
  "content-css": "format_paint",
  icon: "image",
  war: "public",
  devtools: "build",
  override: "tab",
  locale: "translate",
  sandbox: "shield",
  manifest: "description",
  script: "javascript",
  style: "css",
  asset: "draft",
  module: "javascript",
};

interface Props {
  project: Project;
  isExt: boolean;
  report: ExtReport | null;
  onNew(): void;
  onConvert(): void;
  onOpen(file: string, from?: number): void;
  onPreview(path: string): void;
  onExport(): void;
  onIcons(): void;
  onForm(): void;
  onFix(fix: ExtFix): void;
  /** abre o editor das fixtures do chrome.* simulado */
  onSim(): void;
  simCount: number;
}

function lineOf(text: string, off: number) {
  return (text.slice(0, off).match(/\n/g)?.length ?? 0) + 1;
}

function Group({ title, count, children, open: initial = true }: { title: string; count?: number; children: React.ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <div className="mb-1">
      <button className="eyebrow flex w-full items-center gap-1 px-3 pb-1.5 pt-4 text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name={open ? "expand_more" : "chevron_right"} size={16} />
        <span className="flex-1">{title}</span>
        {count != null && <span className="tabular-nums">{count}</span>}
      </button>
      {open && children}
    </div>
  );
}

function Tree({ node, depth, onOpen }: { node: MapNode; depth: number; onOpen(f: string): void }) {
  const [open, setOpen] = useState(depth < 1);
  const has = node.children.length > 0;
  return (
    <li>
      <div className="flex items-center" style={{ paddingLeft: depth * 12 }}>
        <button className="md-icon-btn xs !h-6 !w-6 shrink-0" aria-label={open ? "Recolher" : "Expandir"} disabled={!has} onClick={() => setOpen(!open)} style={{ visibility: has ? "visible" : "hidden" }}>
          <Icon name={open ? "expand_more" : "chevron_right"} size={15} />
        </button>
        <button
          className={cn("md-item h-7 min-w-0 flex-1 gap-1.5 rounded-lg px-1.5 text-[12px]", node.missing && "text-[var(--syn-invalid)]", node.external && "text-md-outline")}
          disabled={!node.file || node.missing}
          onClick={() => node.file && onOpen(node.file)}
          title={node.missing ? "Arquivo não existe" : node.external ? "Arquivo de outro site" : node.file}
        >
          <Icon name={node.missing ? "error" : node.external ? "public" : (ROLE_ICON[node.kind] ?? "draft")} size={15} className="shrink-0" />
          <span className="truncate font-code">{node.label}</span>
        </button>
      </div>
      {open && has && (
        <ul>
          {node.children.map((c, i) => (
            <Tree key={i} node={c} depth={depth + 1} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function ExtensionPanel({ project, isExt, report, onNew, onConvert, onOpen, onPreview, onExport, onIcons, onForm, onFix, onSim, simCount }: Props) {
  const m = report?.manifest;
  const map = useMemo(() => (m ? extensionMap(project.files, m) : null), [project.files, m]);

  if (!isExt)
    return (
      <div className="flex h-full flex-col" data-pz="extension-panel">
        <PanelHeader title="Extensão" />
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          <div className="md-card-outlined rounded-2xl p-4">
            <Icon name="extension" size={28} className="text-md-primary" />
            <div className="mt-2 text-[14px] font-semibold text-md-on-surface">Extension Studio</div>
            <p className="mt-1 text-[12.5px] leading-snug text-md-on-variant">
              Crie extensões para Chrome e Edge (Manifest V3): popup, opções, painel lateral, service worker e content scripts. O Poiesis valida o manifesto, explica as permissões, simula as APIs chrome.* no preview e
              exporta um ZIP pronto para carregar no navegador.
            </p>
            <button className="md-btn md-btn-filled mt-3 h-9 w-full" onClick={onNew}>
              <Icon name="add" size={18} /> Nova extensão…
            </button>
            <button className="md-btn md-btn-text mt-1 h-8 w-full text-[12.5px]" onClick={onConvert}>
              <Icon name="transform" size={17} /> Transformar este projeto em extensão
            </button>
          </div>
        </div>
      </div>
    );

  const errors = report?.problems.filter((p) => p.sev === "error").length ?? 0;
  const warns = report?.problems.filter((p) => p.sev === "warning").length ?? 0;
  const entries = report?.entries.filter((e) => e.role !== "icon" && e.role !== "locale" && e.role !== "war") ?? [];
  const fileText = (n: string) => project.files.find((f) => f.name === n)?.content ?? "";
  const perms: string[] = Array.isArray(m?.permissions) ? m.permissions : [];
  const hosts: string[] = Array.isArray(m?.host_permissions) ? m.host_permissions : [];
  const csBroad = (Array.isArray(m?.content_scripts) ? m.content_scripts : []).some((c: { matches?: unknown }) => Array.isArray(c?.matches) && c.matches.some((x) => BROAD_HOSTS.has(String(x))));
  const warnings = [
    ...(hosts.some((h) => BROAD_HOSTS.has(h) || /^\*:\/\/\*\//.test(h)) || csBroad ? ["Ler e alterar todos os seus dados em todos os sites"] : hosts.length ? [`Ler e alterar seus dados em ${hosts.length === 1 ? hosts[0].replace(/^\*?:?\/\/|\/\*$/g, "") : hosts.length + " sites"}`] : []),
    ...perms.map((p) => PERM.get(p)?.aviso).filter((x): x is string => !!x),
  ];

  return (
    <div className="flex h-full flex-col" data-pz="extension-panel">
      <PanelHeader title="Extensão">
        <button className="md-icon-btn sm" aria-label="Nova extensão" title="Nova extensão" onClick={onNew}>
          <Icon name="add" size={19} />
        </button>
      </PanelHeader>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        <div className="mx-2 rounded-2xl bg-md-low p-3">
          <div className="flex items-start gap-2">
            <Icon name="extension" size={22} className="mt-0.5 text-md-primary" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-semibold text-md-on-surface">{typeof m?.name === "string" ? m.name : "Manifesto inválido"}</div>
              <div className="font-code text-[11.5px] text-md-on-variant">{typeof m?.version === "string" ? `v${m.version} · ` : ""}Manifest V{m?.manifest_version ?? "?"}</div>
            </div>
          </div>
          <div role="status" className={cn("mt-2 flex items-center gap-1.5 text-[12px]", errors ? "text-[var(--syn-invalid)]" : warns ? "text-md-warn" : "text-[var(--verd)]")}>
            <Icon name={errors ? "error" : warns ? "warning" : "check_circle"} size={16} fill />
            {errors ? `${errors} erro(s)${warns ? ` · ${warns} aviso(s)` : ""}` : warns ? `${warns} aviso(s) · pode exportar` : "Pronta para exportar"}
          </div>
          <button className="md-btn md-btn-filled mt-2.5 h-9 w-full" onClick={onExport}>
            <Icon name="folder_zip" size={18} /> Exportar extensão (.zip)
          </button>
          <div className="mt-1 grid grid-cols-2 gap-1">
            <button className="md-btn md-btn-text h-8 text-[12px]" onClick={onForm}>
              <Icon name="tune" size={16} /> Manifesto
            </button>
            <button className="md-btn md-btn-text h-8 text-[12px]" onClick={onIcons}>
              <Icon name="image" size={16} /> Ícones
            </button>
            <button className="md-btn md-btn-text col-span-2 h-8 text-[12px]" onClick={onSim} title="Fixtures do chrome.* simulado: storage inicial, abas e respostas" aria-label="Simulação do chrome.*">
              <Icon name="science" size={16} /> Simulação do chrome.*{simCount ? ` · ${simCount} resposta(s)` : ""}
            </button>
          </div>
        </div>

        {!!report?.problems.length && (
          <Group title="Problemas" count={report.problems.length}>
            <ul className="grid gap-0.5 px-2" aria-label="Problemas da extensão">
              {report.problems.slice(0, 80).map((p, i) => (
                <li key={i} className="rounded-xl px-2 py-1.5 hover:bg-md-low">
                  <button className="flex w-full items-start gap-2 text-left" onClick={() => onOpen(p.file, p.from)}>
                    <Icon name={SEV_ICON[p.sev]} size={16} fill className={cn("mt-0.5 shrink-0", SEV_TONE[p.sev])} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] leading-snug text-md-on-surface">{p.msg}</span>
                      <span className="block font-code text-[10.5px] text-md-outline">
                        {p.file}
                        {p.from > 0 || p.file === "manifest.json" ? `:${lineOf(fileText(p.file), p.from)}` : ""}
                      </span>
                    </span>
                  </button>
                  {p.fix && (
                    <button className="md-btn md-btn-tonal ml-6 mt-1 h-7 px-2.5 text-[11.5px]" onClick={() => onFix(p.fix!)}>
                      <Icon name="auto_fix_high" size={15} /> {p.fix.label}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Group>
        )}

        {entries.length > 0 && (
          <Group title="Pontos de entrada" count={entries.length}>
            <ul className="grid gap-0.5 px-2">
              {entries.map((e, i) => {
                const page = PAGE_ROLES.includes(e.role as Role);
                const exists = project.files.some((f) => f.name === e.path);
                return (
                  <li key={i} className="flex items-center gap-1 rounded-xl pl-2 pr-1 hover:bg-md-low">
                    <Icon name={ROLE_ICON[e.role] ?? "draft"} size={17} className="shrink-0 text-md-on-variant" />
                    <button className="min-w-0 flex-1 py-1.5 text-left" disabled={!exists} onClick={() => onOpen(e.path)}>
                      <span className="block text-[12px] text-md-on-surface">{e.label}</span>
                      <span className={cn("block truncate font-code text-[11px]", exists ? "text-md-on-variant" : "text-[var(--syn-invalid)]")}>{e.path}</span>
                    </button>
                    {page && exists ? (
                      <button className="md-icon-btn xs shrink-0" aria-label={`Ver ${e.label} no preview (simulado)`} title="Ver no preview (APIs chrome.* simuladas)" onClick={() => onPreview(e.path)}>
                        <Icon name="visibility" size={17} />
                      </button>
                    ) : e.role === "background" || e.role === "content" ? (
                      <span className="shrink-0 rounded-full bg-md-high px-1.5 text-[10px] text-md-on-variant" title="Não roda no preview: teste com a extensão instalada">
                        só no navegador
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Group>
        )}

        <Group title="Na instalação o usuário vê" count={warnings.length} open={false}>
          <div className="px-4 text-[12px] leading-snug text-md-on-variant">
            {warnings.length ? (
              <ul className="list-disc pl-4">
                {warnings.map((w) => (
                  <li key={w}>“{w}”</li>
                ))}
              </ul>
            ) : (
              "Nenhum aviso de permissão. 🎉"
            )}
            {perms.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {perms.map((p) => {
                  const info = PERM.get(p);
                  return (
                    <span key={p} className="flex items-center gap-1 rounded-full bg-md-low py-0.5 pl-2 pr-1 font-code text-[11px] text-md-on-surface" title={info?.desc}>
                      {p} {info && <RiskBadge risk={info.risk} />}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </Group>

        {map && (
          <Group title="Mapa da extensão" open={false}>
            <ul className="px-1" aria-label="Mapa da extensão">
              <Tree node={map.root} depth={0} onOpen={(f) => onOpen(f)} />
            </ul>
            {map.orphans.length > 0 && (
              <div className="mx-3 mt-2 rounded-xl bg-md-low p-2 text-[11.5px] text-md-on-variant">
                <div className="mb-1 font-semibold text-md-on-surface">Sem vínculo com o manifesto ({map.orphans.length})</div>
                Vão no ZIP mesmo assim. Apague o que não for usado:
                <div className="mt-1 flex flex-wrap gap-1">
                  {map.orphans.slice(0, 30).map((o) => (
                    <button key={o} className="md-chip h-6 px-2 font-code text-[10.5px]" onClick={() => onOpen(o)}>
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Group>
        )}

        <Group title="Testar de verdade" open={false}>
          <ol className="list-decimal space-y-1 pl-9 pr-4 text-[12px] leading-snug text-md-on-variant">
            <li>Exporte o ZIP e descompacte numa pasta.</li>
            <li>
              Abra <code className="font-code">chrome://extensions</code> e ligue o <b>Modo do desenvolvedor</b>.
            </li>
            <li>
              <b>Carregar sem compactação</b> → escolha a pasta.
            </li>
            <li>Mudou o código? Exporte de novo e clique em ↻ no cartão da extensão.</li>
          </ol>
          <p className="mx-4 mt-2 text-[11.5px] leading-snug text-md-outline">
            O preview simula as APIs chrome.* para o popup, as opções e o painel lateral. Service worker, content scripts, permissões reais e o ciclo de vida do navegador só existem com a extensão instalada.
          </p>
        </Group>
      </div>
    </div>
  );
}
