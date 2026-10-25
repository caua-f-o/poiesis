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
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" className={className} aria-hidden>
      <defs>
        <linearGradient id="lg-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#221f19" />
          <stop offset="1" stopColor="#0c0b09" />
        </linearGradient>
        <linearGradient id="lg-gold" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#b8873e" />
          <stop offset=".6" stopColor="#e2bb72" />
          <stop offset="1" stopColor="#f7e2b0" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="120" height="120" rx="30" fill="url(#lg-bg)" />
      <rect x="4.75" y="4.75" width="118.5" height="118.5" rx="29.25" fill="none" stroke="#e2bb72" strokeOpacity=".22" strokeWidth="1.5" />
      <path d="M41 45 L23 64 L41 83" fill="none" stroke="#efe9dc" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M87 45 L105 64 L87 83" fill="none" stroke="#efe9dc" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M55 96 C 59 80, 64 66, 69 52" fill="none" stroke="url(#lg-gold)" strokeWidth="7.5" strokeLinecap="round" />
      <path d="M60.5 74 C 50 69, 47 60, 49 52 C 57 55, 62.5 63, 60.5 74 Z" fill="url(#lg-gold)" opacity=".85" />
      <path d="M68 54 C 61 47, 63 35, 75 27 C 80 38, 78 49, 68 54 Z" fill="url(#lg-gold)" />
      <path d="M90 20 L92 26 L98 28 L92 30 L90 36 L88 30 L82 28 L88 26 Z" fill="#f7e2b0" />
    </svg>
  );
}
