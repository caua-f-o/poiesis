import type { PFile, Settings } from "@/lib/types";
import type { CursorInfo } from "@/editor/CodeEditor";
import { langLabel } from "@/lib/files";
import { Icon } from "./Icon";
import { cn } from "@/lib/utils";

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
}

export function StatusBar({ file, cursor, settings, saving, errors, warns, missing, onConsole, onTab }: Props) {
  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-[var(--line)] bg-[var(--ink-0)] px-3 text-[11px] text-[var(--paper-3)]">
      <span className={cn("flex items-center gap-1", saving === "error" && "text-[var(--rose)]")}>
        <Icon
          name={saving === "saving" ? "sync" : saving === "error" ? "cloud_off" : "cloud_done"}
          size={14}
          className={saving === "saving" ? "animate-spin" : ""}
        />
        {saving === "saving" ? "Salvando…" : saving === "error" ? "Falha ao salvar" : "Salvo localmente"}
      </span>

      <button onClick={onConsole} className="flex items-center gap-2 rounded px-1 hover:bg-[var(--ink-3)] hover:text-[var(--paper-2)]">
        <span className={cn("flex items-center gap-0.5", errors && "text-[var(--rose)]")}>
          <Icon name="error" size={13} /> {errors}
        </span>
        <span className={cn("flex items-center gap-0.5", warns && "text-[var(--amber)]")}>
          <Icon name="warning" size={13} /> {warns}
        </span>
      </button>

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
          <button className="rounded px-1 hover:bg-[var(--ink-3)] hover:text-[var(--paper-2)]" onClick={onTab} title="Alternar 2/4 espaços">
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
