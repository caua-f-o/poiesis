// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
import { useState } from "react";
import type { Layout, Project } from "@/lib/types";
import { TEMPLATES } from "@/lib/templates";
import { Icon } from "./Icon";
import { IconButton, Tip } from "./md";
import { Switch } from "@/components/ui/switch";
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
  autoRun: boolean;
  layout: Layout;
  busy: boolean;
  onRun(): void;
  onAutoRun(): void;
  onLayout(l: Layout): void;
  onNew(template: string): void;
  onRename(name: string): void;
  onDuplicate(): void;
  onDelete(): void;
  onImportFiles(): void;
  onImportFolder(): void;
  onExportHtml(): void;
  onExportZip(): void;
  onPalette(): void;
}

/** Top app bar (pequena) do Material 3. */
export function TopAppBar(p: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const commit = () => {
    const n = draft.trim();
    if (n && n !== p.project.name) p.onRename(n);
    setEditing(false);
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 pr-3">
      <div className="flex min-w-0 items-baseline gap-3 pl-1">
        <span className="font-display text-[24px] italic leading-none tracking-[-0.01em] text-md-on-surface">Poiesis</span>
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
            className="md-field h-8 w-56"
          />
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onDoubleClick={() => {
                  setDraft(p.project.name);
                  setEditing(true);
                }}
                className="md-btn h-8 max-w-[260px] gap-1 px-3 font-medium text-md-on-variant"
              >
                <span className="truncate">{p.project.name}</span>
                <Icon name="arrow_drop_down" size={20} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Icon name="add" size={19} /> Novo projeto
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-72">
                  {TEMPLATES.map((t) => (
                    <DropdownMenuItem key={t.id} onSelect={() => p.onNew(t.id)} className="h-auto items-start py-2">
                      <Icon name={t.icon} size={20} className="mt-0.5 !text-md-primary" />
                      <span>
                        <span className="block text-[13px]">{t.title}</span>
                        <span className="block text-[11.5px] text-md-on-variant">{t.description}</span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem
                onSelect={() => {
                  setDraft(p.project.name);
                  setTimeout(() => setEditing(true), 50);
                }}
              >
                <Icon name="edit" size={19} /> Renomear
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={p.onDuplicate}>
                <Icon name="content_copy" size={19} /> Duplicar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={p.onDelete} className="text-md-error [&_.msr]:!text-md-error">
                <Icon name="delete" size={19} /> Excluir projeto
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="flex-1" />

      <button onClick={p.onPalette} className="md-search hidden w-[300px] text-left xl:flex">
        <Icon name="search" size={20} />
        <span className="flex-1 truncate">Comandos e arquivos</span>
        <span className="kbd">Ctrl K</span>
      </button>
      <IconButton icon="search" label="Comandos e arquivos" shortcut="Ctrl+K" onClick={p.onPalette} className="xl:hidden" />

      <div className="mx-1 h-6 w-px bg-md-outline-v" />

      <DropdownMenu>
        <Tip label="Importar">
          <DropdownMenuTrigger asChild>
            <button className="md-icon-btn">
              <Icon name="upload" size={21} />
            </button>
          </DropdownMenuTrigger>
        </Tip>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Trazer para o projeto</DropdownMenuLabel>
          <DropdownMenuItem onSelect={p.onImportFiles}>
            <Icon name="upload_file" size={19} /> Arquivos (HTML, CSS, JS…)
            <DropdownMenuShortcut>Ctrl+O</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={p.onImportFolder}>
            <Icon name="drive_folder_upload" size={19} /> Pasta inteira
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <div className="px-4 py-1.5 text-[11.5px] leading-snug text-md-on-variant">Também dá pra arrastar arquivos e pastas na janela ou direto numa pasta da barra lateral.</div>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <Tip label="Exportar">
          <DropdownMenuTrigger asChild>
            <button className="md-icon-btn">
              <Icon name="ios_share" size={20} />
            </button>
          </DropdownMenuTrigger>
        </Tip>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuItem onSelect={p.onExportZip} className="h-auto items-start py-2">
            <Icon name="folder_zip" size={19} className="mt-0.5" />
            <span>
              <span className="block">Projeto (.zip)</span>
              <span className="block text-[11.5px] text-md-on-variant">Todos os arquivos e pastas, como estão</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={p.onExportHtml} className="h-auto items-start py-2">
            <Icon name="html" size={19} className="mt-0.5" />
            <span>
              <span className="block">HTML único</span>
              <span className="block text-[11.5px] text-md-on-variant">CSS, JS e imagens embutidos num arquivo só</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="md-seg ml-1">
        {(
          [
            ["split", "vertical_split", "Lado a lado"],
            ["stack", "horizontal_split", "Empilhado"],
            ["editor", "code", "Só editor"],
            ["preview", "visibility", "Só preview"],
          ] as const
        ).map(([l, icon, title]) => (
          <Tip key={l} label={title} shortcut={l === "split" ? "Ctrl+\\" : undefined}>
            <button data-on={p.layout === l} onClick={() => p.onLayout(l)} aria-label={title}>
              <Icon name={icon} size={18} />
            </button>
          </Tip>
        ))}
      </div>

      <div className="mx-1 h-6 w-px bg-md-outline-v" />

      <Tip label={p.autoRun ? "Ao vivo: atualiza enquanto você digita" : "Manual: atualiza só ao executar"}>
        <label className="flex cursor-pointer items-center gap-2 rounded-full px-2 py-1 text-[12.5px] font-medium text-md-on-variant">
          <Switch checked={p.autoRun} onCheckedChange={p.onAutoRun} aria-label="Modo ao vivo" />
          Ao vivo
        </label>
      </Tip>

      <Tip label="Executar" shortcut="Ctrl+Enter">
        <button onClick={p.onRun} className="md-btn md-btn-filled h-10 pl-3 pr-5">
          <Icon name={p.busy ? "progress_activity" : "play_arrow"} fill size={22} className={p.busy ? "animate-spin" : ""} />
          Executar
        </button>
      </Tip>
    </header>
  );
}
