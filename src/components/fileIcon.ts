// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
import type { PFile } from "@/lib/types";
import { extOf } from "@/lib/files";

export function fileIcon(f: Pick<PFile, "kind" | "name">): { icon: string; color: string } {
  const ext = extOf(f.name);
  switch (f.kind) {
    case "html":
      return { icon: "html", color: "#ef8b7a" };
    case "css":
      return { icon: "css", color: "#8cc7ec" };
    case "js":
      return { icon: "javascript", color: "#e9c46a" };
    case "json":
      return { icon: "data_object", color: "#c9a3ee" };
    case "text":
      if (ext === "svg") return { icon: "shapes", color: "#74c7b4" };
      if (ext === "md") return { icon: "markdown", color: "#a8a399" };
      return { icon: "description", color: "#a8a399" };
    default:
      if (/^(png|jpe?g|gif|webp|avif|ico|bmp)$/.test(ext)) return { icon: "image", color: "#74c7b4" };
      if (/^(woff2?|ttf|otf)$/.test(ext)) return { icon: "font_download", color: "#a8a399" };
      if (/^(mp3|wav|ogg)$/.test(ext)) return { icon: "audio_file", color: "#a8a399" };
      if (/^(mp4|webm)$/.test(ext)) return { icon: "movie", color: "#a8a399" };
      return { icon: "draft", color: "#a8a399" };
  }
}
