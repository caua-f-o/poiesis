import { useCallback, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  dir: "row" | "col";
  /** tamanho do primeiro painel em % */
  size: number;
  onSize(n: number): void;
  min?: number;
  max?: number;
  a: ReactNode;
  b: ReactNode;
  className?: string;
  /** chamado com true/false ao começar/terminar de arrastar */
  onDrag?(dragging: boolean): void;
  /** exibe o tamanho em px do segundo painel enquanto arrasta */
  measure?: (px: number) => void;
  /** esconde um dos lados sem desmontar nada */
  hide?: "a" | "b" | null;
}

export function Split({ dir, size, onSize, min = 15, max = 85, a, b, className, onDrag, measure, hide }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);

  const start = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const el = box.current;
      if (!el) return;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setDrag(true);
      onDrag?.(true);
      const rect = el.getBoundingClientRect();
      const move = (ev: PointerEvent) => {
        const p = dir === "row" ? (ev.clientX - rect.left) / rect.width : (ev.clientY - rect.top) / rect.height;
        const v = Math.max(min, Math.min(max, p * 100));
        onSize(v);
        measure?.(Math.round((dir === "row" ? rect.width : rect.height) * (1 - v / 100)));
      };
      const up = () => {
        setDrag(false);
        onDrag?.(false);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [dir, min, max, onSize, onDrag, measure]
  );

  return (
    <div ref={box} className={cn("relative flex h-full w-full min-h-0 min-w-0", dir === "row" ? "flex-row" : "flex-col", className)}>
      <div
        className={cn("relative min-h-0 min-w-0 overflow-hidden", hide === "a" && "hidden")}
        style={hide === "b" ? { flex: "1 1 0%" } : { flexBasis: `${size}%`, flexGrow: 0, flexShrink: 0 }}
      >
        {a}
      </div>
      <div
        role="separator"
        aria-orientation={dir === "row" ? "vertical" : "horizontal"}
        onPointerDown={start}
        onDoubleClick={() => onSize(50)}
        className={cn(
          "split-handle group relative z-20 flex shrink-0 items-center justify-center",
          hide && "hidden",
          dir === "row" ? "w-2 cursor-col-resize" : "h-2 cursor-row-resize",
          drag && "is-dragging"
        )}
      >
        <span className={cn("grip rounded-full", dir === "row" ? "h-10 w-1" : "h-1 w-10")} />
      </div>
      <div className={cn("relative min-h-0 min-w-0 flex-1 overflow-hidden", hide === "b" && "hidden")}>{b}</div>
      {drag && <div className={cn("fixed inset-0 z-50", dir === "row" ? "cursor-col-resize" : "cursor-row-resize")} />}
    </div>
  );
}
