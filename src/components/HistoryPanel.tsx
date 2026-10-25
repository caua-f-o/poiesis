// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/* Painel "Histórico": linha do tempo de versões locais do projeto, pontos manuais,
 * comparação lado a lado / em linha e restauração de trecho, arquivo ou projeto. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { MergeView, unifiedMergeView } from "@codemirror/merge";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import type { FileKind, Project } from "@/lib/types";
import {
  REASON_LABEL,
  compareEntries,
  deleteRevisions,
  entriesOf,
  historyUsage,
  listRevisions,
  revisionFiles,
  getRevision,
  updateRevision,
  type FileChange,
  type Revision,
  type HistoryUsage,
  type Reason,
} from "@/lib/history";
import { formatBytes } from "@/lib/db";
import { poiesisHighlight, poiesisTheme } from "@/editor/theme";
import { Icon } from "./Icon";
import { IconButton, PanelHeader, Tip } from "./md";
import { fileIcon } from "./fileIcon";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const REASON_ICON: Record<Reason, string> = {
  auto: "schedule",
  manual: "bookmark",
  import: "move_to_inbox",
  "pre-restore": "settings_backup_restore",
  "pre-delete": "delete",
  "pre-replace": "find_replace",
  "pre-rename": "edit",
  "pre-import": "move_to_inbox",
  "pre-backup": "backup",
  "pre-external": "drive_folder_upload",
  conflict: "warning",
};

const time = (t: number) => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
function dayLabel(t: number) {
  const d = new Date(t);
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Hoje";
  if (d.toDateString() === y.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
}

type Filter = "all" | "manual" | "auto";

export function HistoryPanel({
  project,
  projectIds,
  tick,
  onCheckpoint,
  onCompare,
  onExport,
  onImport,
  onCleanOrphans,
  onChanged,
}: {
  project: Project;
  projectIds: string[];
  /** muda quando o App grava uma revisão nova */
  tick: number;
  onCheckpoint(label: string, note: string): void;
  onCompare(rev: Revision): void;
  onExport(): void;
  onImport(): void;
  onCleanOrphans(): void;
  onChanged(): void;
}) {
  const [revs, setRevs] = useState<Revision[] | null>(null);
  const [usage, setUsage] = useState<HistoryUsage | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [file, setFile] = useState<string>("");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Revision | null>(null);

  const reload = useCallback(async () => {
    try {
      const [list, u] = await Promise.all([listRevisions(project.id), historyUsage(projectIds)]);
      setRevs(list);
      setUsage(u);
    } catch {
      setRevs([]);
    }
  }, [project.id, projectIds]);

  useEffect(() => {
    reload();
  }, [reload, tick]);

  const files = useMemo(() => [...new Set((revs ?? []).flatMap((r) => Object.keys(r.entries)))].sort(), [revs]);

  const shown = useMemo(() => {
    if (!revs) return [];
    const q = query.trim().toLowerCase();
    return revs.filter((r, i) => {
      if (filter === "manual" && r.reason === "auto") return false;
      if (filter === "auto" && r.reason !== "auto") return false;
      if (q && !`${r.label ?? ""} ${r.note ?? ""} ${REASON_LABEL[r.reason]}`.toLowerCase().includes(q)) return false;
      if (file) {
        // versões em que esse arquivo mudou em relação à anterior
        const prev = revs[i + 1];
        const a = prev?.entries[file]?.h;
        const b = r.entries[file]?.h;
        if (a === b) return false;
      }
      return true;
    });
  }, [revs, filter, file, query]);

  const groups = useMemo(() => {
    const out: { day: string; items: Revision[] }[] = [];
    for (const r of shown) {
      const day = dayLabel(r.time);
      if (out.at(-1)?.day !== day) out.push({ day, items: [] });
      out.at(-1)!.items.push(r);
    }
    return out;
  }, [shown]);

  const act = async (fn: () => Promise<unknown>) => {
    await fn();
    await reload();
    onChanged();
  };

  return (
    <div className="flex h-full flex-col">
      <PanelHeader title="Histórico">
        <IconButton icon="bookmark_add" label="Criar ponto de restauração" size="sm" onClick={() => setCreating(true)} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton icon="more_vert" label="Mais opções" size="sm" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onSelect={onExport}>
              <Icon name="download" size={19} /> Exportar histórico deste projeto
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onImport}>
              <Icon name="upload" size={19} /> Importar histórico
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => act(() => deleteRevisions((revs ?? []).filter((r) => r.reason === "auto" && !r.pinned).map((r) => r.id)))}
              disabled={!revs?.some((r) => r.reason === "auto" && !r.pinned)}
            >
              <Icon name="auto_delete" size={19} /> Apagar versões automáticas
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onCleanOrphans} disabled={!usage?.orphans}>
              <Icon name="folder_delete" size={19} /> Apagar histórico de projetos excluídos{usage?.orphans ? ` (${usage.orphans})` : ""}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PanelHeader>

      <div className="flex flex-col gap-2 px-3 pb-2">
        <div className="md-search flex h-9 items-center gap-2 rounded-full bg-md-high px-3">
          <Icon name="search" size={18} className="text-md-on-variant" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou nota"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-md-on-surface outline-none placeholder:text-md-on-variant"
            aria-label="Buscar no histórico"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ["all", "Tudo"],
              ["manual", "Pontos e operações"],
              ["auto", "Automáticos"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} className="md-chip h-7 px-2.5 text-[12px]" data-on={filter === id} onClick={() => setFilter(id)}>
              {filter === id && <Icon name="check" size={15} />}
              {label}
            </button>
          ))}
        </div>
        {files.length > 1 && (
          <select
            value={file}
            onChange={(e) => setFile(e.target.value)}
            className="h-8 rounded-lg border border-md-outline-v bg-md-surface px-2 text-[12.5px] text-md-on-surface outline-none focus:border-md-primary"
            aria-label="Filtrar por arquivo"
          >
            <option value="">Todos os arquivos</option>
            {files.map((f) => (
              <option key={f} value={f}>
                Só quando mudou: {f}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" role="list" aria-label="Versões">
        {revs === null && <div className="px-3 py-6 text-center text-[12.5px] text-md-on-variant">Carregando…</div>}
        {revs?.length === 0 && (
          <div className="mx-2 mt-2 rounded-2xl border border-dashed border-md-outline-v p-4 text-[12.5px] leading-relaxed text-md-on-variant">
            <Icon name="history" size={22} className="mb-1 block text-md-primary" />
            Nenhuma versão ainda. O Poiesis guarda uma versão sozinho depois de alguns segundos sem editar, e antes de excluir, importar, substituir ou
            restaurar. Use <b className="text-md-on-surface">Criar ponto</b> para marcar um momento importante.
          </div>
        )}
        {revs && revs.length > 0 && !shown.length && <div className="px-3 py-6 text-center text-[12.5px] text-md-on-variant">Nada com esse filtro.</div>}
        {groups.map((g) => (
          <div key={g.day}>
            <div className="eyebrow px-3 pb-1 pt-3 first-letter:uppercase">{g.day}</div>
            {g.items.map((r) => (
              <div key={r.id} role="listitem" className="group relative">
                <button onClick={() => onCompare(r)} className="md-item h-auto w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left">
                  <Icon name={REASON_ICON[r.reason]} size={18} fill={r.reason === "manual"} className={cn("mt-0.5", r.reason === "manual" ? "text-md-primary" : "text-md-on-variant")} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate text-[13px] font-medium text-md-on-surface">{r.label || REASON_LABEL[r.reason]}</span>
                      <span className="ml-auto shrink-0 text-[11px] tabular-nums text-md-on-variant">{time(r.time)}</span>
                    </span>
                    {r.note && <span className="block truncate text-[11.5px] text-md-on-variant">{r.note}</span>}
                    <span className="mt-0.5 flex gap-2 text-[11px] tabular-nums">
                      {r.label && <span className="text-md-on-variant">{REASON_LABEL[r.reason]}</span>}
                      {r.stats.modified > 0 && <span className="text-[var(--amber)]">~{r.stats.modified}</span>}
                      {r.stats.added > 0 && <span className="text-[var(--verd)]">+{r.stats.added}</span>}
                      {r.stats.removed > 0 && <span className="text-[var(--rose)]">−{r.stats.removed}</span>}
                      {!r.stats.modified && !r.stats.added && !r.stats.removed && <span className="text-md-on-variant">sem mudanças</span>}
                      {r.pinned && <Icon name="push_pin" size={13} fill className="text-md-primary" />}
                    </span>
                  </span>
                </button>
                <div className="absolute right-1.5 top-1.5 hidden gap-0.5 rounded-full bg-md-high group-focus-within:flex group-hover:flex">
                  <IconButton icon="push_pin" label={r.pinned ? "Desafixar" : "Fixar (nunca apagar sozinho)"} size="sm" on={r.pinned} onClick={() => act(() => updateRevision(r.id, { pinned: !r.pinned }))} />
                  <IconButton icon="edit" label="Renomear / anotar" size="sm" onClick={() => setEditing(r)} />
                  <IconButton icon="delete" label="Apagar esta versão" size="sm" onClick={() => act(() => deleteRevisions([r.id]))} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-md-outline-v px-4 py-2 text-[11.5px] text-md-on-variant">
        <Icon name="database" size={15} />
        {usage ? `${revs?.length ?? 0} versões neste projeto · ${formatBytes(usage.bytes)} no total` : "…"}
      </div>

      <LabelDialog
        open={creating}
        title="Criar ponto de restauração"
        confirm="Criar"
        onOpenChange={setCreating}
        onConfirm={(label, note) => {
          onCheckpoint(label, note);
          setTimeout(reload, 300);
        }}
      />
      <LabelDialog
        open={!!editing}
        title="Renomear versão"
        confirm="Salvar"
        initial={editing ? { label: editing.label ?? "", note: editing.note ?? "" } : undefined}
        onOpenChange={(o) => !o && setEditing(null)}
        onConfirm={(label, note) => editing && act(() => updateRevision(editing.id, { label: label || undefined, note: note || undefined }))}
      />
    </div>
  );
}

function LabelDialog({
  open,
  title,
  confirm,
  initial,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  confirm: string;
  initial?: { label: string; note: string };
  onOpenChange(o: boolean): void;
  onConfirm(label: string, note: string): void;
}) {
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (open) {
      setLabel(initial?.label ?? "");
      setNote(initial?.note ?? "");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = () => {
    onConfirm(label.trim(), note.trim());
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Pontos manuais nunca são apagados sozinhos.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="grid gap-1 text-[12px] text-md-on-variant">
            Nome
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="ex.: antes de refazer o menu"
              className="h-10 rounded-lg border border-md-outline bg-transparent px-3 text-[14px] text-md-on-surface outline-none focus:border-md-primary"
            />
          </label>
          <label className="grid gap-1 text-[12px] text-md-on-variant">
            Nota (opcional)
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="rounded-lg border border-md-outline bg-transparent px-3 py-2 text-[13px] text-md-on-surface outline-none focus:border-md-primary"
            />
          </label>
        </div>
        <DialogFooter>
          <button className="md-btn md-btn-text" onClick={() => onOpenChange(false)}>
            Cancelar
          </button>
          <button className="md-btn md-btn-filled" onClick={submit}>
            {confirm}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- comparação ---------------- */

function viewLang(kind: FileKind, name: string): Extension {
  if (kind === "html" || /\.svg$/i.test(name)) return html();
  if (kind === "css") return css();
  if (kind === "js") return javascript();
  if (kind === "json") return json();
  if (/\.(md|markdown)$/i.test(name)) return markdown();
  return [];
}

const readOnly = [EditorState.readOnly.of(true), EditorView.editable.of(false)];
const phrases = EditorState.phrases.of({
  Accept: "Manter o atual",
  Reject: "Trazer da versão salva",
  "$ unchanged lines": "$ linhas iguais",
  "Revert this chunk": "Trazer este trecho da versão salva",
});
const base = (kind: FileKind, name: string): Extension[] => [lineNumbers(), poiesisTheme, poiesisHighlight, viewLang(kind, name), EditorView.lineWrapping, phrases];

const isImage = (mime?: string, name = "") => (mime ?? "").startsWith("image/") || /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)$/i.test(name);

type Against = "current" | "previous";

export function CompareDialog({
  open,
  project,
  revision,
  onOpenChange,
  onRestoreProject,
  onRestoreFiles,
  onApplyContent,
}: {
  open: boolean;
  project: Project;
  revision: Revision | null;
  onOpenChange(o: boolean): void;
  onRestoreProject(rev: Revision): void;
  onRestoreFiles(rev: Revision, paths: string[]): void;
  /** grava no arquivo atual o texto montado com "restaurar trecho" */
  onApplyContent(rev: Revision, path: string, content: string): void;
}) {
  const [against, setAgainst] = useState<Against>("current");
  const [layout, setLayout] = useState<"split" | "unified">(() => (localStorage.getItem("poiesis:diff-layout") as "split" | "unified") || "split");
  const [changes, setChanges] = useState<FileChange[] | null>(null);
  const [showSame, setShowSame] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [texts, setTexts] = useState<{ old: Map<string, string>; cur: Map<string, string> } | null>(null);
  const [edited, setEdited] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { scope: "project" } | { scope: "file"; path: string }>(null);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem("poiesis:diff-layout", layout);
    } catch {
      /* ignora */
    }
  }, [layout]);

  // carrega revisão e o termo de comparação
  useEffect(() => {
    if (!open || !revision) return;
    let alive = true;
    setChanges(null);
    setTexts(null);
    setEdited(null);
    (async () => {
      const oldFiles = await revisionFiles(revision);
      let curEntries;
      let cur = new Map<string, string>();
      if (against === "current") {
        curEntries = (await entriesOf(project)).entries;
        for (const f of project.files) cur.set(f.name, f.content);
      } else {
        const prev = revision.parentId ? await getRevision(revision.parentId) : null;
        curEntries = prev?.entries ?? {};
        cur = prev ? await revisionFiles(prev) : new Map();
      }
      // "previous": versão anterior → esta; "current": esta → atual
      const list = against === "current" ? compareEntries(revision.entries, curEntries) : compareEntries(curEntries, revision.entries);
      if (!alive) return;
      setTexts(against === "current" ? { old: oldFiles, cur } : { old: cur, cur: oldFiles });
      setChanges(list);
      setSel((s) => (s && list.some((c) => c.path === s && c.status !== "same") ? s : (list.find((c) => c.status !== "same")?.path ?? list[0]?.path ?? null)));
    })();
    return () => {
      alive = false;
    };
  }, [open, revision, against, project]);

  const change = changes?.find((c) => c.path === sel) ?? null;
  const oldText = sel ? texts?.old.get(sel) : undefined;
  const curText = sel ? texts?.cur.get(sel) : undefined;
  const binary = change && (change.kind === "asset" || isImage(change.after?.m ?? change.before?.m, change.path));
  const canEditChunks = against === "current" && change?.status === "modified" && !binary;

  // monta o MergeView / visão em linha
  useEffect(() => {
    const el = host.current;
    if (!el || !change || binary || !texts) return;
    el.innerHTML = "";
    const a = oldText ?? "";
    const b = curText ?? "";
    setEdited(null);
    const ext = base(change.kind, change.path);
    const track = EditorView.updateListener.of((u) => {
      if (u.docChanged) setEdited(u.state.doc.toString() === b ? null : u.state.doc.toString());
    });
    if (layout === "split") {
      const mv = new MergeView({
        a: { doc: a, extensions: [...ext, ...readOnly] },
        b: { doc: b, extensions: [...ext, ...readOnly, track] },
        parent: el,
        revertControls: canEditChunks ? "a-to-b" : undefined,
        renderRevertControl: () => {
          const btn = document.createElement("button");
          btn.className = "pz-revert";
          btn.title = "Trazer este trecho da versão salva";
          btn.setAttribute("aria-label", "Trazer este trecho da versão salva");
          btn.innerHTML = '<span class="msr">arrow_forward</span>';
          return btn;
        },
        highlightChanges: true,
        gutter: true,
        collapseUnchanged: { margin: 3, minSize: 8 },
      });
      return () => mv.destroy();
    }
    const v = new EditorView({
      parent: el,
      state: EditorState.create({
        doc: b,
        extensions: [...ext, ...readOnly, track, unifiedMergeView({ original: a, mergeControls: canEditChunks, highlightChanges: true, gutter: true, collapseUnchanged: { margin: 3, minSize: 8 } })],
      }),
    });
    return () => v.destroy();
  }, [change, binary, texts, oldText, curText, layout, canEditChunks]);

  const visible = (changes ?? []).filter((c) => showSame || c.status !== "same");
  const counts = {
    modified: changes?.filter((c) => c.status === "modified").length ?? 0,
    added: changes?.filter((c) => c.status === "added").length ?? 0,
    removed: changes?.filter((c) => c.status === "removed").length ?? 0,
  };
  const STATUS: Record<FileChange["status"], { t: string; c: string }> = {
    modified: { t: "M", c: "text-[var(--amber)]" },
    added: { t: "A", c: "text-[var(--verd)]" },
    removed: { t: "R", c: "text-[var(--rose)]" },
    same: { t: "=", c: "text-md-on-variant" },
  };
  const dirLabel = against === "current" ? ["Versão salva", "Atual"] : ["Versão anterior", "Esta versão"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(88vh,860px)] max-w-[min(1240px,96vw)] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b border-md-outline-v py-3 pl-5 pr-16">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-[17px]">{revision ? revision.label || REASON_LABEL[revision.reason] : ""}</DialogTitle>
            <DialogDescription className="text-[12px]">
              {revision && new Date(revision.time).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" })}
              {revision?.note ? ` · ${revision.note}` : ""}
            </DialogDescription>
          </div>
          <div className="md-seg h-8">
            {(
              [
                ["current", "Com o atual"],
                ["previous", "Com a anterior"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} data-on={against === id} onClick={() => setAgainst(id)} className="!px-3 text-[12px]">
                {label}
              </button>
            ))}
          </div>
          <div className="md-seg h-8">
            <Tip label="Lado a lado">
              <button data-on={layout === "split"} onClick={() => setLayout("split")} aria-label="Lado a lado" className="!min-w-[34px] !px-2">
                <Icon name="vertical_split" size={17} />
              </button>
            </Tip>
            <Tip label="Em linha">
              <button data-on={layout === "unified"} onClick={() => setLayout("unified")} aria-label="Em linha" className="!min-w-[34px] !px-2">
                <Icon name="view_agenda" size={17} />
              </button>
            </Tip>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          <div className="flex w-60 shrink-0 flex-col border-r border-md-outline-v">
            <div className="flex gap-3 px-4 pb-1 pt-3 text-[11.5px] tabular-nums">
              <span className="text-[var(--amber)]">~{counts.modified} alterados</span>
              <span className="text-[var(--verd)]">+{counts.added}</span>
              <span className="text-[var(--rose)]">−{counts.removed}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1" role="listbox" aria-label="Arquivos">
              {changes === null && <div className="px-2 py-4 text-[12px] text-md-on-variant">Comparando…</div>}
              {changes && !visible.length && <div className="px-2 py-4 text-[12px] text-md-on-variant">Nenhuma diferença.</div>}
              {visible.map((c) => {
                const fi = fileIcon({ kind: c.kind, name: c.path });
                return (
                  <button
                    key={c.path}
                    role="option"
                    aria-selected={c.path === sel}
                    data-on={c.path === sel}
                    onClick={() => setSel(c.path)}
                    className="md-item h-8 w-full gap-2 rounded-lg px-2 text-left text-[12.5px]"
                  >
                    <span style={{ color: fi.color }} className="flex">
                      <Icon name={fi.icon} size={16} />
                    </span>
                    <span className={cn("min-w-0 flex-1 truncate", c.status === "removed" && "line-through opacity-70")}>{c.path}</span>
                    <span className={cn("font-code text-[11px] font-bold", STATUS[c.status].c)}>{STATUS[c.status].t}</span>
                  </button>
                );
              })}
            </div>
            <label className="flex items-center gap-2 border-t border-md-outline-v px-4 py-2 text-[11.5px] text-md-on-variant">
              <input type="checkbox" checked={showSame} onChange={(e) => setShowSame(e.target.checked)} /> Mostrar iguais
            </label>
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            {change && (
              <div className="flex h-9 shrink-0 items-center gap-2 border-b border-md-outline-v px-3 text-[11.5px] text-md-on-variant">
                {layout === "split" && !binary ? (
                  <>
                    <span className="flex-1">{dirLabel[0]}</span>
                    <span className="flex-1">{dirLabel[1]}</span>
                  </>
                ) : (
                  <span className="flex-1">
                    {dirLabel[0]} → {dirLabel[1]}
                  </span>
                )}
                {canEditChunks && <span className="text-md-on-surface">Use as setas para trazer trechos da versão salva</span>}
              </div>
            )}
            <div className="pz-merge min-h-0 flex-1 overflow-auto">
              {change && binary ? (
                <div className="grid h-full grid-cols-2 gap-4 p-6">
                  {[oldText, curText].map((src, i) => (
                    <div key={i} className="flex flex-col items-center justify-center gap-2 rounded-xl border border-md-outline-v p-4">
                      <span className="text-[11.5px] text-md-on-variant">{dirLabel[i]}</span>
                      {src ? (
                        isImage(change.after?.m ?? change.before?.m, change.path) ? (
                          <img src={src.startsWith("data:") ? src : "data:image/svg+xml;charset=utf-8," + encodeURIComponent(src)} alt="" className="max-h-[50vh] max-w-full object-contain" />
                        ) : (
                          <span className="text-[12px]">{formatBytes(src.length)}</span>
                        )
                      ) : (
                        <span className="text-[12px] text-md-on-variant">não existe</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div ref={host} className="h-full" />
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="items-center border-t border-md-outline-v px-5 py-3 sm:justify-start">
          <span className="mr-auto text-[11.5px] text-md-on-variant">Antes de restaurar, o estado atual vira uma versão — dá pra voltar.</span>
          {edited !== null && revision && sel && (
            <button
              className="md-btn md-btn-tonal"
              onClick={() => {
                onApplyContent(revision, sel, edited);
                setEdited(null);
              }}
            >
              <Icon name="done_all" size={18} /> Aplicar trechos no arquivo
            </button>
          )}
          {revision && sel && change && against === "current" && change.status !== "same" && (
            <button className="md-btn md-btn-outlined" onClick={() => setConfirm({ scope: "file", path: sel })}>
              <Icon name="restore_page" size={18} /> Restaurar este arquivo
            </button>
          )}
          {revision && (
            <button className="md-btn md-btn-filled" onClick={() => setConfirm({ scope: "project" })}>
              <Icon name="settings_backup_restore" size={18} /> Restaurar projeto inteiro
            </button>
          )}
        </DialogFooter>

        <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
          <DialogContent className="max-w-[460px]">
            <DialogHeader>
              <DialogTitle>{confirm?.scope === "project" ? "Restaurar o projeto inteiro?" : "Restaurar este arquivo?"}</DialogTitle>
              <DialogDescription className="leading-relaxed">
                {confirm?.scope === "project" ? (
                  <>
                    Todos os arquivos voltam a como estavam em <b>{revision && new Date(revision.time).toLocaleString("pt-BR")}</b>
                    {counts.added > 0 && <> — {counts.added} arquivo(s) criado(s) depois serão removidos</>}. O estado atual é salvo antes no histórico.
                  </>
                ) : (
                  <>
                    <b>{confirm?.scope === "file" ? confirm.path : ""}</b> volta à versão salva
                    {change?.status === "added" ? " — como ele não existia nessa versão, será removido" : ""}. O estado atual é salvo antes no histórico.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <button className="md-btn md-btn-text" onClick={() => setConfirm(null)}>
                Cancelar
              </button>
              <button
                className="md-btn md-btn-filled"
                onClick={() => {
                  if (!revision || !confirm) return;
                  if (confirm.scope === "project") onRestoreProject(revision);
                  else onRestoreFiles(revision, [confirm.path]);
                  setConfirm(null);
                }}
              >
                Restaurar
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
