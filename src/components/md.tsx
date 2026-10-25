// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
import { forwardRef, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Icon } from "./Icon";
import { cn } from "@/lib/utils";

/** Envolve qualquer elemento com um tooltip simples do Material 3. */
export function Tip({ label, shortcut, side = "bottom", children }: { label: ReactNode; shortcut?: string; side?: "top" | "bottom" | "left" | "right"; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>
        {label}
        {shortcut && <span className="font-code text-[10.5px] opacity-70">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string;
  label: string;
  shortcut?: string;
  on?: boolean;
  size?: "md" | "sm" | "xs";
  iconSize?: number;
  fill?: boolean;
  side?: "top" | "bottom" | "left" | "right";
  badge?: ReactNode;
}

/** Botão de ícone M3 com tooltip e estado "selecionado". */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, shortcut, on, size = "md", iconSize, fill, side, badge, className, ...rest },
  ref
) {
  const btn = (
    <button ref={ref} aria-label={label} data-on={on} className={cn("md-icon-btn", size !== "md" && size, className)} {...rest}>
      <Icon name={icon} size={iconSize ?? (size === "xs" ? 17 : size === "sm" ? 19 : 21)} fill={fill} />
      {badge}
    </button>
  );
  return (
    <Tip label={label} shortcut={shortcut} side={side}>
      {btn}
    </Tip>
  );
});

/** Ripple do Material: um único ouvinte global para todos os elementos interativos M3. */
export function installRipple() {
  const SEL = ".md-btn, .md-icon-btn, .md-chip, .md-item, .md-seg > button, .md-rail-item .md-rail-ind, .md-search";
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const target = (e.target as HTMLElement | null)?.closest?.(SEL) as HTMLElement | null;
    if (!target || (target as HTMLButtonElement).disabled) return;
    const r = target.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2.2;
    const w = document.createElement("span");
    w.className = "md-ripple-wave";
    w.style.width = w.style.height = size + "px";
    w.style.left = e.clientX - r.left - size / 2 + "px";
    w.style.top = e.clientY - r.top - size / 2 + "px";
    target.appendChild(w);
    setTimeout(() => w.remove(), 550);
  };
  window.addEventListener("pointerdown", onDown, true);
  return () => window.removeEventListener("pointerdown", onDown, true);
}

/** Cabeçalho de painel lateral (navigation drawer). */
export function PanelHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 pl-4 pr-2">
      <span className="md-title-m flex-1 truncate">{title}</span>
      {children}
    </div>
  );
}
