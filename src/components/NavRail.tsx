// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
import type { Panel } from "@/lib/types";
import { Icon, Logo } from "./Icon";
import { Tip } from "./md";
import { cn } from "@/lib/utils";

const ITEMS: { id: Panel; icon: string; label: string; key: string }[] = [
  { id: "files", icon: "folder", label: "Arquivos", key: "Ctrl+B" },
  { id: "search", icon: "manage_search", label: "Buscar", key: "Ctrl+Shift+F" },
  { id: "projects", icon: "stacks", label: "Projetos", key: "" },
  { id: "history", icon: "history", label: "Histórico", key: "" },
  { id: "extension", icon: "extension", label: "Extensão", key: "" },
  { id: "themes", icon: "palette", label: "Temas", key: "" },
];

interface Props {
  panel: Panel;
  open: boolean;
  onSelect(p: Panel): void;
  onSettings(): void;
  onHelp(): void;
}

/** Navigation rail do Material 3: destinos com indicador em pílula e rótulo. */
export function NavRail({ panel, open, onSelect, onSettings, onHelp }: Props) {
  return (
    <nav className="flex w-[76px] shrink-0 flex-col items-center gap-1 pb-3 pt-2">
      <div className="mb-3 flex h-12 items-center">
        <Logo size={34} />
      </div>
      {ITEMS.map((it) => {
        const active = open && panel === it.id;
        return (
          <Tip key={it.id} label={active ? `Recolher ${it.label.toLowerCase()}` : it.label} shortcut={it.key || undefined} side="right">
            <button onClick={() => onSelect(it.id)} className="md-rail-item group flex w-full flex-col items-center gap-1 py-1" aria-pressed={active}>
              <span
                className={cn(
                  "md-rail-ind relative isolate flex h-8 w-14 items-center justify-center overflow-hidden rounded-full transition-colors duration-200",
                  active ? "bg-md-secondary-c text-md-on-secondary-c" : "text-md-on-variant group-hover:bg-[color-mix(in_oklab,var(--md-on-surface)_8%,transparent)]"
                )}
              >
                <Icon name={it.icon} size={22} fill={active} />
              </span>
              <span className={cn("text-[11.5px] leading-4 transition-colors", active ? "font-semibold text-md-on-surface" : "font-medium text-md-on-variant")}>{it.label}</span>
            </button>
          </Tip>
        );
      })}
      <div className="flex-1" />
      <Tip label="Atalhos de teclado" side="right">
        <button onClick={onHelp} className="md-icon-btn" aria-label="Atalhos de teclado">
          <Icon name="keyboard" size={21} />
        </button>
      </Tip>
      <Tip label="Preferências" side="right">
        <button onClick={onSettings} className="md-icon-btn" aria-label="Preferências">
          <Icon name="settings" size={21} />
        </button>
      </Tip>
    </nav>
  );
}
