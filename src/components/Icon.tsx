// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
import { cn } from "@/lib/utils";

interface IconProps {
  name: string;
  fill?: boolean;
  size?: number;
  className?: string;
  title?: string;
}

/** Material Symbols Rounded (fonte local, empacotada na extensão). */
export function Icon({ name, fill, size = 18, className, title }: IconProps) {
  return (
    <span
      aria-hidden={title ? undefined : true}
      title={title}
      className={cn("msr shrink-0", fill && "msr-fill", className)}
      style={{ fontSize: size }}
    >
      {name}
    </span>
  );
}

/** Marca: o "</>" cuja barra brota — a ποίησις, o trazer-à-existência. */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  // o mesmo desenho do ícone da extensão (design/icon.svg → public/icons/icon.svg)
  return <img src="icons/icon.svg" width={size} height={size} alt="" aria-hidden className={className} draggable={false} />;
}
