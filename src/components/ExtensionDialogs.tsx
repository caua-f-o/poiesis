// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/* Diálogos do Extension Studio: nova extensão, gerador de ícones e exportação. */
import { useEffect, useState } from "react";
import type { PFile } from "@/lib/types";
import { DEFAULT_EXT, type Companion, type ExtOptions } from "@/lib/ext/templates";
import { ICON_SIZES, renderIcons, svgDataUrl, type IconOptions } from "@/lib/ext/icons";
import { matchPatternError } from "@/lib/ext/permissions";
import type { ExtProblem } from "@/lib/ext/validate";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "./Icon";
import { SEV_ICON, SEV_TONE } from "./ManifestForm";
import { Range } from "./md";
import { cn } from "@/lib/utils";

/* ---------------- nova extensão ---------------- */

const PARTS: { key: keyof Pick<ExtOptions, "popup" | "options" | "sidepanel" | "content" | "background">; icon: string; title: string; desc: string }[] = [
  { key: "popup", icon: "ads_click", title: "Popup", desc: "Janela que abre ao clicar no ícone da extensão." },
  { key: "options", icon: "settings", title: "Página de opções", desc: "Configurações guardadas em chrome.storage.sync." },
  { key: "sidepanel", icon: "right_panel_open", title: "Painel lateral", desc: "Fica aberto ao lado das páginas (Chrome 114+)." },
  { key: "content", icon: "code_blocks", title: "Content script", desc: "Roda dentro das páginas de sites escolhidos. Só com a extensão instalada." },
  { key: "background", icon: "settings_suggest", title: "Service worker", desc: "Código de fundo, eventos do navegador. Só com a extensão instalada." },
];

export function NewExtensionDialog({ open, onOpenChange, onCreate }: { open: boolean; onOpenChange(o: boolean): void; onCreate(o: ExtOptions): void }) {
  const [o, setO] = useState<ExtOptions>(DEFAULT_EXT);
  useEffect(() => {
    if (open) setO(DEFAULT_EXT);
  }, [open]);
  const matchErr = o.content ? matchPatternError(o.matches.trim()) : null;
  const ok = o.name.trim() && !matchErr && (o.popup || o.options || o.sidepanel || o.content || o.background);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]" data-pz="new-extension">
        <DialogHeader>
          <DialogTitle>Nova extensão</DialogTitle>
          <DialogDescription>Um projeto Manifest V3 com código comentado, ícones e um LEIA-ME de como testar no Chrome.</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[62vh] gap-3 overflow-y-auto pr-1">
          <label className="grid gap-1">
            <span className="text-[12px] font-medium text-md-on-variant">Nome</span>
            <input autoFocus className="md-field" aria-label="Nome da extensão" value={o.name} maxLength={75} onChange={(e) => setO({ ...o, name: e.target.value })} />
          </label>
          <label className="grid gap-1">
            <span className="text-[12px] font-medium text-md-on-variant">Descrição</span>
            <input className="md-field" aria-label="Descrição da extensão" value={o.description} maxLength={132} onChange={(e) => setO({ ...o, description: e.target.value })} />
          </label>
          <fieldset className="grid gap-1.5">
            <legend className="mb-1 text-[12px] font-medium text-md-on-variant">Partes</legend>
            {PARTS.map((p) => (
              <label key={p.key} className={cn("md-item h-auto cursor-pointer items-start gap-3 rounded-xl px-3 py-2", o[p.key] && "bg-md-secondary-c")}>
                <input type="checkbox" className="mt-1" checked={o[p.key]} onChange={(e) => setO({ ...o, [p.key]: e.target.checked })} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-md-on-surface">{p.title}</span>
                  <span className="block text-[11.5px] leading-snug text-md-on-variant">{p.desc}</span>
                </span>
                <Icon name={p.icon} size={19} className="mt-0.5 text-md-on-variant" />
              </label>
            ))}
          </fieldset>
          {o.content && (
            <label className="grid gap-1">
              <span className="text-[12px] font-medium text-md-on-variant">O content script roda em</span>
              <input className="md-field font-code" aria-label="Páginas do content script" value={o.matches} onChange={(e) => setO({ ...o, matches: e.target.value })} />
              <span className={cn("text-[11.5px]", matchErr ? "text-[var(--syn-invalid)]" : "text-md-outline")}>{matchErr ?? "Padrão de URL. Evite *://*/* — dá acesso a todos os sites."}</span>
            </label>
          )}
          <fieldset className="grid gap-1.5">
            <legend className="mb-1 text-[12px] font-medium text-md-on-variant">Conversa com outra extensão</legend>
            <div className="md-seg h-auto" role="radiogroup" aria-label="Conversa com outra extensão">
              {(
                [
                  ["nenhum", "Nenhuma"],
                  ["principal", "Principal (recebe)"],
                  ["complementar", "Complementar (envia)"],
                ] as [Companion, string][]
              ).map(([k, label]) => (
                <button key={k} role="radio" aria-checked={o.companion === k} data-on={o.companion === k} onClick={() => setO({ ...o, companion: k, popup: k === "complementar" ? true : o.popup })} className="!h-8 flex-1 text-[12px]">
                  {label}
                </button>
              ))}
            </div>
            {o.companion !== "nenhum" && (
              <p className="text-[11.5px] leading-snug text-md-on-variant">
                {o.companion === "principal"
                  ? "O service worker responde a extensões autorizadas em externally_connectable.ids e confere o remetente de novo antes de agir."
                  : "O popup manda uma mensagem para a principal. Você informa o ID dela em config.js depois de carregar as duas no Chrome."}
              </p>
            )}
          </fieldset>
        </div>
        <DialogFooter>
          <button className="md-btn md-btn-text" onClick={() => onOpenChange(false)}>
            Cancelar
          </button>
          <button className="md-btn md-btn-filled" disabled={!ok} onClick={() => onCreate(o)}>
            Criar extensão
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- ícones ---------------- */

export function IconsDialog({ open, onOpenChange, images, onApply }: { open: boolean; onOpenChange(o: boolean): void; images: PFile[]; onApply(icons: Record<number, string>): void }) {
  const [src, setSrc] = useState<string>("");
  const [opts, setOpts] = useState<IconOptions>({ padding: 0.08, background: null, radius: 0.22 });
  const [bg, setBg] = useState("#1a1712");
  const [out, setOut] = useState<Record<number, string> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const first = images.find((f) => /icon|logo|128/i.test(f.name)) ?? images[0];
    setSrc(first ? (first.kind === "asset" ? first.content : svgDataUrl(first.content)) : "");
    setOut(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!src) return void setOut(null);
    let alive = true;
    renderIcons(src, { ...opts, background: opts.background ? bg : null })
      .then((r) => alive && (setOut(r), setErr(null)))
      .catch((e) => alive && (setOut(null), setErr((e as Error).message)));
    return () => {
      alive = false;
    };
  }, [src, opts, bg]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]" data-pz="icons-dialog">
        <DialogHeader>
          <DialogTitle>Gerar ícones</DialogTitle>
          <DialogDescription>Uma imagem quadrada (de preferência 128 px ou maior, ou SVG) vira PNGs de 16, 32, 48 e 128 px em icons/, já ligados no manifesto.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="grid gap-1">
            <span className="text-[12px] font-medium text-md-on-variant">Imagem-base</span>
            <select
              className="md-field font-code"
              aria-label="Imagem-base do projeto"
              value={images.find((f) => (f.kind === "asset" ? f.content : svgDataUrl(f.content)) === src)?.name ?? ""}
              onChange={(e) => {
                const f = images.find((x) => x.name === e.target.value);
                if (f) setSrc(f.kind === "asset" ? f.content : svgDataUrl(f.content));
              }}
            >
              <option value="">{src ? "(imagem do computador)" : "Escolha uma imagem do projeto…"}</option>
              {images.map((f) => (
                <option key={f.id} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label className="md-btn md-btn-text h-8 w-fit cursor-pointer">
            <Icon name="upload" size={17} /> Usar uma imagem do computador
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label="Imagem do computador"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const r = new FileReader();
                r.onload = () => setSrc(String(r.result));
                r.readAsDataURL(file);
              }}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-[12px] font-medium text-md-on-variant">Margem: {Math.round(opts.padding * 100)}%</span>
              <Range min={0} max={30} value={Math.round(opts.padding * 100)} aria-label="Margem" onChange={(v) => setOpts({ ...opts, padding: v / 100 })} />
            </label>
            <div className="grid gap-1">
              <label className="flex items-center gap-2 text-[12px] font-medium text-md-on-variant">
                <input type="checkbox" checked={!!opts.background} onChange={(e) => setOpts({ ...opts, background: e.target.checked ? bg : null })} /> Fundo
                <input type="color" value={bg} disabled={!opts.background} aria-label="Cor do fundo" onChange={(e) => setBg(e.target.value)} className="h-6 w-8 border-0 bg-transparent" />
              </label>
              <label className="grid gap-1 text-[12px] text-md-on-variant">
                Arredondamento: {Math.round(opts.radius * 100)}%
                <Range min={0} max={50} value={Math.round(opts.radius * 100)} disabled={!opts.background} aria-label="Arredondamento" onChange={(v) => setOpts({ ...opts, radius: v / 100 })} />
              </label>
            </div>
          </div>
          <div className="flex items-end justify-center gap-5 rounded-2xl bg-md-low p-4" aria-label="Prévia dos ícones">
            {ICON_SIZES.map((s) => (
              <figure key={s} className="grid justify-items-center gap-1">
                <div className="flex items-center justify-center rounded-md" style={{ width: Math.max(s, 20), height: Math.max(s, 20), background: "repeating-conic-gradient(#8883 0 25%, transparent 0 50%) 0 0/8px 8px" }}>
                  {out?.[s] && <img src={out[s]} width={s} height={s} alt={`Ícone ${s}`} style={{ imageRendering: s <= 32 ? "pixelated" : "auto" }} />}
                </div>
                <figcaption className="font-code text-[10.5px] text-md-outline">{s}</figcaption>
              </figure>
            ))}
          </div>
          {err && <div className="text-[12px] text-[var(--syn-invalid)]">{err}</div>}
        </div>
        <DialogFooter>
          <button className="md-btn md-btn-text" onClick={() => onOpenChange(false)}>
            Cancelar
          </button>
          <button className="md-btn md-btn-filled" disabled={!out} onClick={() => out && onApply(out)}>
            Gerar e usar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- exportar ---------------- */

export function ExportExtensionDialog({
  open,
  onOpenChange,
  problems,
  count,
  excluded,
  onExport,
  onOpenProblem,
}: {
  open: boolean;
  onOpenChange(o: boolean): void;
  problems: ExtProblem[];
  count: number;
  excluded: string[];
  onExport(): void;
  onOpenProblem(p: ExtProblem): void;
}) {
  const errors = problems.filter((p) => p.sev === "error");
  const warns = problems.filter((p) => p.sev === "warning");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]" data-pz="export-extension">
        <DialogHeader>
          <DialogTitle>{errors.length ? `A extensão tem ${errors.length} erro(s)` : "Exportar extensão"}</DialogTitle>
          <DialogDescription>
            {errors.length
              ? "Com esses erros o Chrome provavelmente recusa carregar a extensão, ou alguma parte não vai funcionar. Corrija antes ou exporte mesmo assim."
              : `${count} arquivos, com o manifest.json na raiz do ZIP.`}
          </DialogDescription>
        </DialogHeader>
        <ul className="grid max-h-[40vh] gap-1 overflow-y-auto" aria-label="Problemas antes de exportar">
          {[...errors, ...warns].slice(0, 30).map((p, i) => (
            <li key={i}>
              <button className="md-item h-auto items-start gap-2 rounded-xl px-2 py-1.5 text-left" onClick={() => onOpenProblem(p)}>
                <Icon name={SEV_ICON[p.sev]} size={17} fill className={cn("mt-0.5 shrink-0", SEV_TONE[p.sev])} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] leading-snug text-md-on-surface">{p.msg}</span>
                  <span className="block font-code text-[10.5px] text-md-outline">{p.file}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {excluded.length > 0 && <p className="text-[12px] text-md-on-variant">Ficam fora do ZIP (são só do Poiesis): {excluded.join(", ")}</p>}
        <DialogFooter>
          <button className="md-btn md-btn-text" onClick={() => onOpenChange(false)}>
            {errors.length ? "Corrigir antes" : "Cancelar"}
          </button>
          <button className={cn("md-btn", errors.length ? "md-btn-tonal" : "md-btn-filled")} onClick={onExport}>
            {errors.length ? "Exportar mesmo assim" : "Exportar"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
