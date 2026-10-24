import { useEffect, useRef } from "react";
import type { PFile } from "@/lib/types";
import { Icon } from "./Icon";
import { IconButton } from "./md";
import { fileIcon } from "./fileIcon";
import { cn } from "@/lib/utils";

interface Props {
  tabs: PFile[];
  activeId: string | null;
  wrap: boolean;
  canFormat: boolean;
  formatting: boolean;
  onOpen(id: string): void;
  onClose(id: string): void;
  onFormat(): void;
  onSearch(): void;
  onWrap(): void;
  onIcon(): void;
}

/** Abas no estilo "primary tabs" do Material 3: indicador arredondado sob o rótulo ativo. */
export function EditorTabs(p: Props) {
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>("[data-active=true]");
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [p.activeId]);

  return (
    <div className="flex h-11 shrink-0 items-stretch border-b border-md-outline-v">
      <div
        ref={strip}
        role="tablist"
        className="flex min-w-0 flex-1 items-stretch overflow-x-auto pl-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onWheel={(e) => {
          if (strip.current && Math.abs(e.deltaY) > Math.abs(e.deltaX)) strip.current.scrollLeft += e.deltaY;
        }}
      >
        {p.tabs.map((f) => {
          const { icon, color } = fileIcon(f);
          const active = f.id === p.activeId;
          const short = f.name.split("/").pop();
          const dir = f.name.includes("/") ? f.name.slice(0, f.name.lastIndexOf("/")) : "";
          return (
            <div
              key={f.id}
              role="tab"
              aria-selected={active}
              data-active={active}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  p.onClose(f.id);
                }
              }}
              onClick={() => p.onOpen(f.id)}
              title={f.name}
              className={cn(
                "md-item group relative !w-auto shrink-0 cursor-pointer !rounded-none !rounded-t-xl pl-3.5 pr-1.5",
                active ? "text-md-on-surface" : "text-md-on-variant"
              )}
            >
              <span className="msr" style={{ fontSize: 17, color, opacity: active ? 1 : 0.75 }}>
                {icon}
              </span>
              <span className={cn("font-code text-[12.5px]", active && "font-semibold")}>{short}</span>
              {dir && <span className="max-w-[90px] truncate text-[11px] text-md-outline">{dir}</span>}
              <button
                className={cn("md-icon-btn xs !h-6 !w-6 transition-opacity", active ? "opacity-80" : "opacity-0 group-hover:opacity-70")}
                onClick={(e) => {
                  e.stopPropagation();
                  p.onClose(f.id);
                }}
                aria-label="Fechar aba"
              >
                <Icon name="close" size={15} />
              </button>
              {active && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-md-primary" />}
            </div>
          );
        })}
      </div>
      <div className="flex shrink-0 items-center gap-0.5 px-1.5">
        <IconButton icon="interests" label="Inserir ícone Material Symbols" shortcut="Alt+I" size="sm" onClick={p.onIcon} />
        <IconButton icon="search" label="Buscar e substituir" shortcut="Ctrl+F" size="sm" onClick={p.onSearch} />
        <IconButton icon="wrap_text" label="Quebra de linha" shortcut="Alt+Z" size="sm" on={p.wrap} onClick={p.onWrap} />
        <IconButton
          icon={p.formatting ? "progress_activity" : "format_align_left"}
          label="Formatar documento"
          shortcut="Shift+Alt+F"
          size="sm"
          disabled={!p.canFormat || p.formatting}
          onClick={p.onFormat}
          className={p.formatting ? "[&_.msr]:animate-spin" : ""}
        />
      </div>
    </div>
  );
}
