// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
import type { PFile, Settings } from "@/lib/types";
import type { CursorInfo } from "@/editor/CodeEditor";
import { langLabel } from "@/lib/files";
import { Icon } from "./Icon";
import { cn } from "@/lib/utils";
import type { FolderStatus } from "@/lib/useFolderSync";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const FOLDER_STATE: Record<FolderStatus["state"], { icon: string; label: string; cls: string }> = {
  linked: { icon: "folder_open", label: "Pasta vinculada", cls: "" },
  permission: { icon: "lock", label: "Aguardando permissão", cls: "text-[var(--amber)]" },
  missing: { icon: "folder_off", label: "Pasta não encontrada", cls: "text-[var(--rose)]" },
  error: { icon: "error", label: "Erro ao acessar a pasta", cls: "text-[var(--rose)]" },
};

interface Props {
  file: PFile | null;
  cursor: CursorInfo | null;
  settings: Settings;
  saving: "idle" | "saving" | "saved" | "error";
  errors: number;
  warns: number;
  missing: string[];
  onConsole(): void;
  onTab(): void;
  folder?: FolderStatus;
  onFolderSync?(): void;
  onFolderReconnect?(): void;
  onFolderUnlink?(): void;
}

export function StatusBar({ file, cursor, settings, saving, errors, warns, missing, onConsole, onTab, folder, onFolderSync, onFolderReconnect, onFolderUnlink }: Props) {
  const fs = folder ? FOLDER_STATE[folder.state] : null;
  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 px-4 text-[11.5px] text-md-on-variant">
      <span className={cn("flex items-center gap-1", saving === "error" && "text-[var(--rose)]")}>
        <Icon
          name={saving === "saving" ? "sync" : saving === "error" ? "cloud_off" : "cloud_done"}
          size={14}
          className={saving === "saving" ? "animate-spin" : ""}
        />
        {saving === "saving" ? "Salvando…" : saving === "error" ? "Falha ao salvar" : "Salvo localmente"}
      </span>

      <button onClick={onConsole} className="flex items-center gap-2 rounded px-1 md-state hover:text-md-on-surface">
        <span className={cn("flex items-center gap-0.5", errors && "text-[var(--rose)]")}>
          <Icon name="error" size={13} /> {errors}
        </span>
        <span className={cn("flex items-center gap-0.5", warns && "text-[var(--amber)]")}>
          <Icon name="warning" size={13} /> {warns}
        </span>
      </button>

      {folder && fs && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={cn("flex items-center gap-1 rounded px-1 md-state hover:text-md-on-surface", fs.cls)} aria-label={`${fs.label}: ${folder.name}`}>
              <Icon name={folder.busy ? "sync" : fs.icon} size={14} className={folder.busy ? "animate-spin" : ""} />
              <span className="max-w-[160px] truncate font-code">{folder.name}</span>
              {folder.state !== "linked" && <span>· {fs.label.toLowerCase()}</span>}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-72">
            <DropdownMenuLabel className="font-normal">
              <div className="text-[13px] font-medium text-md-on-surface">{folder.name}</div>
              <div className="text-[11.5px] leading-snug text-md-on-variant">
                {folder.state === "linked"
                  ? `Edições gravadas direto na pasta${folder.lastSync ? ` · sincronizado às ${new Date(folder.lastSync).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}`
                  : (folder.error ?? fs.label)}
              </div>
              {!!folder.skipped?.length && <div className="mt-1 text-[11.5px] text-[var(--amber)]">{folder.skipped.length} arquivo(s) ficaram de fora (ignorados ou grandes demais)</div>}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {folder.state === "linked" ? (
              <DropdownMenuItem onSelect={onFolderSync}>
                <Icon name="sync" size={19} /> Sincronizar agora
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={onFolderReconnect}>
                <Icon name="lock_open" size={19} /> {folder.state === "permission" ? "Permitir acesso à pasta" : "Tentar de novo"}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={onFolderUnlink}>
              <Icon name="link_off" size={19} /> Desvincular (manter só no navegador)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {missing.length > 0 && (
        <span className="flex items-center gap-1 text-[var(--amber)]" title={"Referências não encontradas no projeto:\n" + missing.join("\n")}>
          <Icon name="link_off" size={13} />
          {missing.length === 1 ? `"${missing[0]}" não está no projeto` : `${missing.length} arquivos referenciados não estão no projeto`}
        </span>
      )}

      <div className="flex-1" />

      {file && file.kind !== "asset" && cursor && (
        <>
          <span className="tabular-nums">
            Ln {cursor.line}, Col {cursor.col}
            {cursor.sel > 0 && <span className="text-[var(--paper-2)]"> ({cursor.sel} selecionados)</span>}
          </span>
          <button className="rounded px-1 md-state hover:text-md-on-surface" onClick={onTab} title="Alternar 2/4 espaços">
            Espaços: {settings.tabSize}
          </button>
          <span>UTF-8</span>
        </>
      )}
      {file && <span className="text-[var(--paper-2)]">{langLabel(file.kind, file.name)}</span>}
      {settings.emmet && file && (file.kind === "html" || file.kind === "css") && (
        <span className="flex items-center gap-1 text-[var(--verd)]" title="Emmet ativo: digite uma abreviação e aperte Tab">
          <Icon name="bolt" size={13} fill /> Emmet
        </span>
      )}
    </footer>
  );
}
