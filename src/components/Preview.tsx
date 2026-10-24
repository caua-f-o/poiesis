import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { Device, PFile } from "@/lib/types";
import { Icon } from "./Icon";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { IconButton, Tip } from "./md";

export interface PreviewHandle {
  eval(code: string): void;
  reload(): void;
  highlight(selector: string): void;
}

const DEVICES: Record<Exclude<Device, "full">, { w: number; h: number; label: string }> = {
  tablet: { w: 820, h: 1180, label: "Tablet" },
  mobile: { w: 390, h: 844, label: "Celular" },
};

interface Props {
  html: string;
  page: PFile | null;
  pages: PFile[];
  device: Device;
  landscape: boolean;
  busy: boolean;
  loadMs: number | null;
  errors: number;
  warns: number;
  consoleOpen: boolean;
  canPopout: boolean;
  dragging: boolean;
  onPage(id: string): void;
  onDevice(d: Device): void;
  onLandscape(): void;
  onPopout(): void;
  onToggleConsole(): void;
  onExportHtml(): void;
}

export const Preview = forwardRef<PreviewHandle, Props>(function Preview(p, ref) {
  const host = useRef<HTMLIFrameElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const htmlRef = useRef(p.html);
  htmlRef.current = p.html;

  const send = (msg: unknown) => host.current?.contentWindow?.postMessage(msg, "*");

  useEffect(() => {
    if (ready) send({ __poiesisHost: 1, type: "render", html: p.html });
  }, [p.html, ready]);

  useImperativeHandle(ref, () => ({
    eval: (code) => send({ __poiesisHost: 1, type: "eval", code }),
    reload: () => send({ __poiesisHost: 1, type: "render", html: htmlRef.current, hard: true }),
    highlight: (selector) => send({ __poiesisHost: 1, type: "highlight", selector }),
  }));

  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dev = p.device === "full" ? null : DEVICES[p.device];
  const dw = dev ? (p.landscape ? dev.h : dev.w) : 0;
  const dh = dev ? (p.landscape ? dev.w : dev.h) : 0;
  const pad = 40;
  const scale = dev ? Math.min(1, (size.w - pad) / dw, (size.h - pad - 22) / dh) : 1;

  const htmlPages = p.pages;

  const reload = () => send({ __poiesisHost: 1, type: "render", html: p.html, hard: true });

  return (
    <div className="flex h-full flex-col">
      {/* barra do preview */}
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-md-outline-v px-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="md-search h-8 min-w-[120px] max-w-[380px] flex-1 gap-2 pl-3 pr-2 text-left">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", p.busy ? "pulse-dot bg-md-primary" : p.errors ? "bg-md-error" : "bg-md-success")} />
              <span className="truncate font-code text-[11.5px] text-md-on-surface">
                <span className="text-md-outline">poiesis://</span>
                {p.page?.name ?? "—"}
              </span>
              <Icon name="unfold_more" size={16} className="ml-auto text-md-outline" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[240px]">
            <DropdownMenuLabel>Páginas do projeto</DropdownMenuLabel>
            {htmlPages.length === 0 && <div className="px-4 py-1.5 text-xs text-md-on-variant">Nenhuma página HTML</div>}
            {htmlPages.map((f) => (
              <DropdownMenuItem key={f.id} onSelect={() => p.onPage(f.id)} className="font-code text-[12px]">
                <Icon name="html" size={18} className="!text-syn-tag" />
                {f.name}
                {f.id === p.page?.id && <Icon name="check" size={17} className="ml-auto !text-md-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="ml-1 hidden shrink-0 font-code text-[10.5px] tabular-nums text-md-outline 2xl:inline">
          {dev ? `${dw}×${dh} · ${Math.round(scale * 100)}%` : `${size.w}×${size.h}`}
          {p.loadMs != null && !p.busy && <span className="ml-2">{p.loadMs} ms</span>}
        </span>

        <div className="md-seg ml-auto h-7">
          {(
            [
              ["full", "desktop_windows", "Tela cheia"],
              ["tablet", "tablet_mac", "Tablet · 820×1180"],
              ["mobile", "smartphone", "Celular · 390×844"],
            ] as const
          ).map(([d, icon, title]) => (
            <Tip key={d} label={title}>
              <button data-on={p.device === d} onClick={() => p.onDevice(d)} aria-label={title} className="!min-w-[32px] !px-1.5">
                <Icon name={icon} size={16} />
              </button>
            </Tip>
          ))}
        </div>
        <IconButton icon="screen_rotation" label="Girar dispositivo" size="sm" disabled={!dev} onClick={p.onLandscape} />
        <IconButton icon="refresh" label="Recarregar" shortcut="Ctrl+R" size="sm" onClick={reload} />
        {p.canPopout && <IconButton icon="open_in_new" label="Abrir em nova aba (sincronizada)" size="sm" onClick={p.onPopout} />}
        <IconButton icon="download" label="Baixar HTML único" size="sm" onClick={p.onExportHtml} />
        <IconButton
          icon="terminal"
          label="Console"
          shortcut="Ctrl+J"
          size="sm"
          on={p.consoleOpen}
          onClick={p.onToggleConsole}
          badge={
            p.errors + p.warns > 0 ? (
              <span className={cn("absolute right-0 top-0 min-w-[16px] rounded-full px-1 text-[9.5px] font-bold leading-4 text-md-surface tabular-nums", p.errors ? "bg-md-error" : "bg-md-warn")}>
                {p.errors + p.warns > 99 ? "99+" : p.errors + p.warns}
              </span>
            ) : undefined
          }
        />
      </div>

      {/* palco */}
      <div ref={area} className={cn("relative min-h-0 flex-1 overflow-hidden", dev && "dotgrid")}>
        <div
          className={cn("absolute", dev ? "left-1/2 top-1/2" : "inset-0")}
          style={dev ? { width: dw, height: dh, transform: `translate(-50%, calc(-50% - 6px)) scale(${scale})` } : undefined}
        >
          <iframe
            ref={host}
            title="Preview"
            src="sandbox.html"
            onLoad={() => setReady(true)}
            className={cn(
              "block h-full w-full border-0 bg-white",
              dev && "rounded-[22px] shadow-[0_0_0_10px_var(--md-surface-container-highest),0_0_0_11px_var(--md-outline-variant),0_30px_80px_-20px_rgba(0,0,0,.6)]",
              p.dragging && "pointer-events-none"
            )}
          />
        </div>
        {dev && (
          <div className="pointer-events-none absolute bottom-2 left-0 right-0 text-center font-code text-[10.5px] text-md-outline">
            {DEVICES[p.device as "tablet"].label} · {dw} × {dh}
          </div>
        )}
      </div>
    </div>
  );
});
