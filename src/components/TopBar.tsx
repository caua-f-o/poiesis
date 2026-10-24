import { useState } from "react";
import type { Layout, Project } from "@/lib/types";
import { TEMPLATES } from "@/lib/templates";
import { Icon, Logo } from "./Icon";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  project: Project;
  projects: Project[];
  autoRun: boolean;
  layout: Layout;
  onRun(): void;
  onAutoRun(): void;
  onLayout(l: Layout): void;
  onSwitch(id: string): void;
  onNew(template: string): void;
  onRename(name: string): void;
  onDuplicate(): void;
  onDelete(): void;
  onImportFiles(): void;
  onImportFolder(): void;
  onExportHtml(): void;
  onExportZip(): void;
  onPalette(): void;
  onSettings(): void;
}

const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} d`;
};

export function TopBar(p: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const commit = () => {
    const n = draft.trim();
    if (n && n !== p.project.name) p.onRename(n);
    setEditing(false);
  };

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--line)] bg-[var(--ink-0)] pl-3 pr-2">
      <div className="flex items-center gap-2.5 pr-1">
        <Logo size={26} />
        <span className="font-display text-[21px] italic leading-none tracking-[-0.01em] text-[var(--paper)]">Poiesis</span>
      </div>
      <span className="text-[var(--line-2)]">/</span>

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="h-7 w-48 rounded-md border border-[var(--gold-lo)] bg-[var(--ink-1)] px-2 text-[13px] text-[var(--paper)] outline-none"
        />
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onDoubleClick={() => {
                setDraft(p.project.name);
                setEditing(true);
              }}
              className="flex h-7 max-w-[240px] items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-[var(--paper)] hover:bg-[var(--ink-3)]"
            >
              <span className="truncate">{p.project.name}</span>
              <Icon name="expand_more" size={16} className="text-[var(--paper-3)]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuLabel className="eyebrow">Projetos</DropdownMenuLabel>
            <div className="max-h-64 overflow-y-auto">
              {p.projects.map((x) => (
                <DropdownMenuItem key={x.id} onSelect={() => p.onSwitch(x.id)} className="gap-2">
                  <Icon name={x.id === p.project.id ? "radio_button_checked" : "radio_button_unchecked"} size={15} className={x.id === p.project.id ? "text-[var(--gold)]" : "text-[var(--paper-3)]"} />
                  <span className="truncate">{x.name}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-[var(--paper-3)]">{ago(x.updatedAt)}</span>
                </DropdownMenuItem>
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2">
                <Icon name="add" size={16} /> Novo projeto
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-64">
                {TEMPLATES.map((t) => (
                  <DropdownMenuItem key={t.id} onSelect={() => p.onNew(t.id)} className="items-start gap-2.5 py-2">
                    <Icon name={t.icon} size={18} className="mt-0.5 text-[var(--gold)]" />
                    <span>
                      <span className="block text-[13px]">{t.title}</span>
                      <span className="block text-[11.5px] text-[var(--paper-3)]">{t.description}</span>
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem
              className="gap-2"
              onSelect={() => {
                setDraft(p.project.name);
                setTimeout(() => setEditing(true), 50);
              }}
            >
              <Icon name="drive_file_rename_outline" size={16} /> Renomear
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2" onSelect={p.onDuplicate}>
              <Icon name="content_copy" size={16} /> Duplicar
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 text-[var(--rose)] focus:text-[var(--rose)]" onSelect={p.onDelete}>
              <Icon name="delete" size={16} /> Excluir projeto
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <div className="flex-1" />

      {/* execução */}
      <div className="flex items-center rounded-lg border border-[var(--line-2)] bg-[var(--ink-1)] p-0.5">
        <button
          onClick={p.onRun}
          title="Executar (Ctrl+Enter)"
          className="flex h-7 items-center gap-1.5 rounded-md bg-[var(--gold)] pl-2 pr-2.5 text-[12.5px] font-semibold text-[#17130c] transition hover:bg-[var(--gold-hi)] active:scale-[.97]"
        >
          <Icon name="play_arrow" fill size={18} />
          Executar
        </button>
        <button
          onClick={p.onAutoRun}
          title={p.autoRun ? "Ao vivo: o preview atualiza enquanto você digita" : "Manual: só atualiza ao executar"}
          className={cn(
            "ml-0.5 flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium transition-colors",
            p.autoRun ? "text-[var(--verd)] hover:bg-[var(--ink-4)]" : "text-[var(--paper-3)] hover:bg-[var(--ink-4)] hover:text-[var(--paper-2)]"
          )}
        >
          <Icon name={p.autoRun ? "bolt" : "pause"} fill={p.autoRun} size={16} />
          {p.autoRun ? "Ao vivo" : "Manual"}
        </button>
      </div>

      <div className="mx-1 h-5 w-px bg-[var(--line-2)]" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="tool px-2" title="Importar">
            <Icon name="upload" size={18} />
            <span className="hidden lg:inline">Importar</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem className="gap-2" onSelect={p.onImportFiles}>
            <Icon name="upload_file" size={17} /> Arquivos (HTML, CSS, JS…)
            <DropdownMenuShortcut>Ctrl+O</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2" onSelect={p.onImportFolder}>
            <Icon name="drive_folder_upload" size={17} /> Pasta inteira
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5 text-[11.5px] leading-snug text-[var(--paper-3)]">Dica: também dá pra arrastar arquivos e pastas direto na janela.</div>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="tool px-2" title="Exportar">
            <Icon name="ios_share" size={17} />
            <span className="hidden lg:inline">Exportar</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem className="items-start gap-2 py-2" onSelect={p.onExportZip}>
            <Icon name="folder_zip" size={17} className="mt-0.5" />
            <span>
              <span className="block">Projeto (.zip)</span>
              <span className="block text-[11.5px] text-[var(--paper-3)]">Todos os arquivos, como estão</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem className="items-start gap-2 py-2" onSelect={p.onExportHtml}>
            <Icon name="html" size={17} className="mt-0.5" />
            <span>
              <span className="block">HTML único</span>
              <span className="block text-[11.5px] text-[var(--paper-3)]">CSS, JS e imagens embutidos num arquivo só</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="mx-1 h-5 w-px bg-[var(--line-2)]" />

      <div className="flex items-center rounded-md bg-[var(--ink-1)] p-0.5">
        {(
          [
            ["split", "vertical_split", "Lado a lado"],
            ["stack", "horizontal_split", "Empilhado"],
            ["editor", "code", "Só editor"],
            ["preview", "visibility", "Só preview"],
          ] as const
        ).map(([l, icon, title]) => (
          <button key={l} className="tool h-6 min-w-6 px-1" data-on={p.layout === l} title={title} onClick={() => p.onLayout(l)}>
            <Icon name={icon} size={16} />
          </button>
        ))}
      </div>

      <button className="tool ml-1 gap-2 border border-[var(--line-2)] px-2" onClick={p.onPalette} title="Paleta de comandos">
        <Icon name="search" size={16} />
        <span className="kbd">Ctrl K</span>
      </button>
      <button className="tool" title="Preferências" onClick={p.onSettings}>
        <Icon name="tune" size={18} />
      </button>
    </header>
  );
}
