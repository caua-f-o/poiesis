import { useEffect, useRef } from "react";
import type { PFile } from "@/lib/types";
import { Icon } from "./Icon";
import { fileIcon } from "./fileIcon";
import { cn } from "@/lib/utils";

interface Props {
  tabs: PFile[];
  activeId: string | null;
  sidebar: boolean;
  wrap: boolean;
  canFormat: boolean;
  formatting: boolean;
  onOpen(id: string): void;
  onClose(id: string): void;
  onShowSidebar(): void;
  onFormat(): void;
  onSearch(): void;
  onWrap(): void;
}

export function EditorTabs(p: Props) {
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>("[data-active=true]");
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [p.activeId]);

  return (
    <div className="flex h-10 shrink-0 items-stretch border-b border-[var(--line)] bg-[var(--ink-1)]">
      {!p.sidebar && (
        <button className="tool my-auto ml-1.5" title="Mostrar arquivos (Ctrl+B)" onClick={p.onShowSidebar}>
          <Icon name="left_panel_open" size={17} />
        </button>
      )}
      <div
        ref={strip}
        className="flex min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
              data-active={active}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  p.onClose(f.id);
                }
              }}
              className={cn(
                "group relative flex shrink-0 cursor-pointer items-center gap-2 border-r border-[var(--line)] pl-3 pr-1.5 transition-colors",
                active ? "bg-[var(--ink-2)] text-[var(--paper)]" : "text-[var(--paper-3)] hover:bg-[var(--ink-3)] hover:text-[var(--paper-2)]"
              )}
              onClick={() => p.onOpen(f.id)}
              title={f.name}
            >
              {active && <span className="absolute inset-x-0 top-0 h-[2px] bg-[var(--gold)]" />}
              <span className="msr" style={{ fontSize: 16, color, opacity: active ? 1 : 0.7 }}>
                {icon}
              </span>
              <span className="font-code text-[12px]">{short}</span>
              {dir && <span className="max-w-[90px] truncate text-[11px] text-[var(--paper-3)]">{dir}</span>}
              <button
                className={cn(
                  "ml-0.5 flex h-5 w-5 items-center justify-center rounded transition-opacity hover:bg-[var(--ink-5)]",
                  active ? "opacity-70 hover:opacity-100" : "opacity-0 group-hover:opacity-70"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  p.onClose(f.id);
                }}
                title="Fechar"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex shrink-0 items-center gap-0.5 border-l border-[var(--line)] px-1.5">
        <button className="tool" title="Buscar e substituir (Ctrl+F)" onClick={p.onSearch}>
          <Icon name="search" size={17} />
        </button>
        <button className="tool" title="Quebra de linha (Alt+Z)" data-on={p.wrap} onClick={p.onWrap}>
          <Icon name="wrap_text" size={17} />
        </button>
        <button className="tool" title="Formatar documento (Shift+Alt+F)" disabled={!p.canFormat || p.formatting} onClick={p.onFormat}>
          <Icon name={p.formatting ? "hourglass_top" : "format_align_left"} size={17} />
        </button>
      </div>
    </div>
  );
}
