// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/* Canal tipado preview → editor.
 * Toda mensagem do runtime do preview traz versão e o token da sessão do editor.
 * Nada é confiável por padrão: a origem (janela do iframe sandbox) é conferida no App,
 * e aqui conferimos versão, sessão, tipo e o formato de cada campo. */
import type { LogLevel, Ser, SourceRef } from "./types";
import { sanitizeEntry, type NetEntry } from "./net";
import { parseInspect, type InspectMessage } from "./inspect";

export const BRIDGE_VERSION = 1;

/** Token desta aba do editor; vai no runtime de cada build e volta em cada mensagem. */
export const SESSION = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");

export type PreviewMessage =
  | { type: "log"; level: LogLevel; args: Ser[]; src: SourceRef | null }
  | { type: "clear" }
  | { type: "storage"; data: Record<string, string> }
  | { type: "navigate"; path: string; hash: string }
  | { type: "open"; href: string }
  | { type: "ready"; ms: number }
  | { type: "net"; entry: NetEntry }
  | { type: "inspect"; msg: InspectMessage };

const LEVELS = new Set<LogLevel>(["log", "info", "warn", "error", "debug", "result", "input", "system"]);
const MAX_ARGS = 100;
const MAX_STORAGE = 5 * 1024 * 1024;

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const str = (x: unknown, max = 4096): x is string => typeof x === "string" && x.length <= max;

function srcRef(x: unknown): SourceRef | null | undefined {
  if (x == null) return null;
  if (!isObj(x) || !str(x.file, 1024) || typeof x.line !== "number" || typeof x.col !== "number") return undefined;
  return { file: x.file, line: x.line, col: x.col };
}

/** Devolve a mensagem validada ou null se ela não for do formato esperado. */
export function parsePreviewMessage(d: unknown, session = SESSION): PreviewMessage | null {
  if (!isObj(d) || d.__poiesis !== 1 || d.v !== BRIDGE_VERSION || d.s !== session || typeof d.type !== "string") return null;
  switch (d.type) {
    case "log": {
      if (!LEVELS.has(d.level as LogLevel) || !Array.isArray(d.args) || d.args.length > MAX_ARGS) return null;
      if (!d.args.every((a) => isObj(a) && typeof a.t === "string")) return null;
      const src = srcRef(d.src);
      if (src === undefined) return null;
      return { type: "log", level: d.level as LogLevel, args: d.args as Ser[], src };
    }
    case "clear":
      return { type: "clear" };
    case "storage": {
      if (!isObj(d.data)) return null;
      let size = 0;
      for (const [k, v] of Object.entries(d.data)) {
        if (typeof v !== "string") return null;
        size += k.length + v.length;
        if (size > MAX_STORAGE) return null;
      }
      return { type: "storage", data: d.data as Record<string, string> };
    }
    case "navigate":
      return str(d.path, 2048) && (d.hash === undefined || str(d.hash, 2048)) ? { type: "navigate", path: d.path, hash: (d.hash as string) ?? "" } : null;
    case "open":
      return str(d.href, 4096) ? { type: "open", href: d.href } : null;
    case "net": {
      const entry = sanitizeEntry(d.e);
      return entry ? { type: "net", entry } : null;
    }
    case "inspect": {
      const msg = parseInspect(d);
      return msg ? { type: "inspect", msg } : null;
    }
    case "ready":
      return typeof d.ms === "number" ? { type: "ready", ms: d.ms } : null;
    default:
      return null;
  }
}
