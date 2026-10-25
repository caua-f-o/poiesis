// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/* Gerador de ícones da extensão: uma imagem-base vira PNGs de 16, 32, 48 e 128 px. */

export const ICON_SIZES = [16, 32, 48, 128] as const;

export interface IconOptions {
  /** margem em volta da imagem, de 0 a 0.3 do lado */
  padding: number;
  /** cor de fundo; null = transparente */
  background: string | null;
  /** arredondamento do fundo, de 0 a 0.5 do lado */
  radius: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("Não foi possível ler a imagem."));
    img.src = src;
  });
}

/** Desenha a imagem em cada tamanho e devolve data URLs PNG. */
export async function renderIcons(src: string, o: IconOptions, sizes: readonly number[] = ICON_SIZES): Promise<Record<number, string>> {
  const img = await loadImage(src);
  const iw = img.naturalWidth || img.width || 128;
  const ih = img.naturalHeight || img.height || 128;
  const out: Record<number, string> = {};
  for (const s of sizes) {
    const c = document.createElement("canvas");
    c.width = c.height = s;
    const g = c.getContext("2d")!;
    g.imageSmoothingQuality = "high";
    if (o.background) {
      const r = Math.min(0.5, Math.max(0, o.radius)) * s;
      g.fillStyle = o.background;
      g.beginPath();
      g.roundRect(0, 0, s, s, r);
      g.fill();
    }
    const pad = Math.round(Math.min(0.3, Math.max(0, o.padding)) * s);
    const box = s - pad * 2;
    const k = Math.min(box / iw, box / ih);
    const w = iw * k;
    const h = ih * k;
    g.drawImage(img, (s - w) / 2, (s - h) / 2, w, h);
    out[s] = c.toDataURL("image/png");
  }
  return out;
}

const esc = (s: string) => s.replace(/[<&>"]/g, (c) => ({ "<": "&lt;", "&": "&amp;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Ícone padrão dos modelos: a inicial do nome sobre um quadrado arredondado em dourado. */
export function defaultIconSvg(name: string): string {
  const letter = esc((name.trim().match(/[\p{L}\p{N}]/u)?.[0] ?? "P").toUpperCase());
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e6c487"/><stop offset="1" stop-color="#b8893f"/></linearGradient></defs>
  <rect x="4" y="4" width="120" height="120" rx="28" fill="url(#g)"/>
  <text x="64" y="86" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="68" font-weight="700" fill="#1a1712">${letter}</text>
</svg>`;
}

export const svgDataUrl = (svg: string) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
