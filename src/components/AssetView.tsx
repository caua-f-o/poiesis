// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
import { useState } from "react";
import type { PFile } from "@/lib/types";
import { Icon } from "./Icon";
import { bytes, dataURLToBytes } from "@/lib/files";

export function AssetView({ file, onCopy }: { file: PFile; onCopy(text: string, label: string): void }) {
  const [dims, setDims] = useState<string | null>(null);
  const isImg = (file.mime || "").startsWith("image/");
  const isAudio = (file.mime || "").startsWith("audio/");
  const isVideo = (file.mime || "").startsWith("video/");
  const size = (() => {
    try {
      return bytes(dataURLToBytes(file.content).length);
    } catch {
      return "—";
    }
  })();
  const snippet = isImg
    ? `<img src="${file.name}" alt="">`
    : isAudio
      ? `<audio src="${file.name}" controls></audio>`
      : isVideo
        ? `<video src="${file.name}" controls></video>`
        : `url("${file.name}")`;

  return (
    <div className="dotgrid flex h-full flex-col items-center justify-center gap-6 p-8">
      <div className="flex max-h-[60%] max-w-full items-center justify-center">
        {isImg && (
          <img
            src={file.content}
            alt={file.name}
            onLoad={(e) => setDims(`${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight}`)}
            className="max-h-full max-w-full rounded-md object-contain shadow-[0_20px_60px_-20px_rgba(0,0,0,.8)] [background:repeating-conic-gradient(#222_0_25%,#1a1a1a_0_50%)_50%/16px_16px]"
          />
        )}
        {isAudio && <audio src={file.content} controls />}
        {isVideo && <video src={file.content} controls className="max-h-full max-w-full rounded-md" />}
        {!isImg && !isAudio && !isVideo && <Icon name="draft" size={64} className="text-[var(--paper-3)]" />}
      </div>
      <div className="w-full max-w-md rounded-xl border border-[var(--line-2)] bg-[var(--ink-2)] p-4">
        <div className="font-code text-[13px] text-[var(--paper)]">{file.name}</div>
        <div className="mt-1 flex gap-3 text-[11.5px] text-[var(--paper-3)]">
          <span>{file.mime}</span>
          <span>{size}</span>
          {dims && <span>{dims} px</span>}
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-md bg-[var(--ink-0)] px-3 py-2">
          <code className="flex-1 truncate font-code text-[12px] text-[#a9d18e]">{snippet}</code>
          <button className="tool h-6" title="Copiar" onClick={() => onCopy(snippet, "Trecho copiado")}>
            <Icon name="content_copy" size={15} />
          </button>
        </div>
        <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--paper-3)]">
          Referencie pelo caminho relativo no HTML ou CSS — o Poiesis troca pelo arquivo real no preview.
        </p>
      </div>
    </div>
  );
}
