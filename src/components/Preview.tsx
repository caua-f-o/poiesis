import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { Device, PFile } from "@/lib/types";
import { Icon } from "./Icon";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export interface PreviewHandle {
  eval(code: string): void;
  reload(): void;
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

  return (
    <div className="flex h-full flex-col bg-[var(--ink-1)]">
      {/* barra do preview */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-[var(--line)] px-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="group flex h-7 min-w-[120px] max-w-[380px] flex-1 items-center gap-2 rounded-md border border-[var(--line-2)] bg-[var(--ink-0)] px-2 text-left transition-colors hover:border-[var(--gold-lo)]">
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", p.busy ? "pulse-dot bg-[var(--gold)]" : p.errors ? "bg-[var(--rose)]" : "bg-[var(--verd)]")} />
              <span className="truncate font-code text-[11.5px] text-[var(--paper-2)]">
                <span className="text-[var(--paper-3)]">poiesis://</span>
                {p.page?.name ?? "—"}
              </span>
              <Icon name="unfold_more" size={14} className="ml-auto text-[var(--paper-3)] group-hover:text-[var(--paper-2)]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[220px]">
            {htmlPages.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma página HTML</div>}
            {htmlPages.map((f) => (
              <DropdownMenuItem key={f.id} onSelect={() => p.onPage(f.id)} className="gap-2 font-code text-[12px]">
                <Icon name="html" size={16} className="text-[var(--rose)]" />
                {f.name}
                {f.id === p.page?.id && <Icon name="check" size={15} className="ml-auto text-[var(--gold)]" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="ml-1 hidden shrink-0 font-code text-[10.5px] tabular-nums text-[var(--paper-3)] xl:inline">
          {dev ? `${dw}×${dh} · ${Math.round(scale * 100)}%` : `${size.w}×${size.h}`}
          {p.loadMs != null && !p.busy && <span className="ml-2">{p.loadMs} ms</span>}
        </span>

        <div className="ml-auto flex items-center rounded-md bg-[var(--ink-0)] p-0.5">
          {(
            [
              ["full", "desktop_windows", "Tela cheia"],
              ["tablet", "tablet_mac", "Tablet (820×1180)"],
              ["mobile", "smartphone", "Celular (390×844)"],
            ] as const
          ).map(([d, icon, title]) => (
            <button key={d} className="tool h-6 min-w-6 px-1" data-on={p.device === d} title={title} onClick={() => p.onDevice(d)}>
              <Icon name={icon} size={16} />
            </button>
          ))}
        </div>
        <button className="tool" title="Girar dispositivo" disabled={!dev} onClick={p.onLandscape}>
          <Icon name="screen_rotation" size={17} />
        </button>
        <button className="tool" title="Recarregar (Ctrl+R)" onClick={() => send({ __poiesisHost: 1, type: "render", html: p.html, hard: true })}>
          <Icon name="refresh" size={18} />
        </button>
        {p.canPopout && (
          <button className="tool" title="Abrir preview em nova aba (sincronizada)" onClick={p.onPopout}>
            <Icon name="open_in_new" size={17} />
          </button>
        )}
        <button className="tool" title="Baixar HTML único" onClick={p.onExportHtml}>
          <Icon name="download" size={17} />
        </button>
        <button className="tool relative" title="Console (Ctrl+J)" data-on={p.consoleOpen} onClick={p.onToggleConsole}>
          <Icon name="terminal" size={17} />
          {p.errors + p.warns > 0 && (
            <span className={cn("absolute -right-0.5 -top-0.5 min-w-[14px] rounded-full px-1 text-[9px] font-bold leading-[14px] text-[var(--ink-0)] tabular-nums", p.errors ? "bg-[var(--rose)]" : "bg-[var(--amber)]")}>
              {p.errors + p.warns > 99 ? "99+" : p.errors + p.warns}
            </span>
          )}
        </button>
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
              dev && "rounded-[18px] shadow-[0_0_0_10px_#1d1d22,0_0_0_11px_#2c2c33,0_30px_80px_-20px_rgba(0,0,0,.8)]",
              p.dragging && "pointer-events-none"
            )}
          />
        </div>
        {dev && (
          <div className="pointer-events-none absolute bottom-2 left-0 right-0 text-center font-code text-[10.5px] text-[var(--paper-3)]">
            {DEVICES[p.device as "tablet"].label} · {dw} × {dh}
          </div>
        )}
      </div>
    </div>
  );
});
