// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
import type { FileKind, PFile } from "./types";

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function extOf(name: string) {
  const m = /\.([^./]+)$/.exec(name.toLowerCase());
  return m ? m[1] : "";
}

export function baseName(path: string) {
  return path.split("/").pop() || path;
}

export function dirName(path: string) {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

const TEXT_EXT: Record<string, FileKind> = {
  html: "html",
  htm: "html",
  css: "css",
  js: "js",
  mjs: "js",
  cjs: "js",
  json: "json",
  txt: "text",
  md: "text",
  svg: "text",
  xml: "text",
  csv: "text",
  webmanifest: "json",
  map: "json",
};

const MIME: Record<string, string> = {
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  json: "application/json",
  webmanifest: "application/manifest+json",
  txt: "text/plain",
  md: "text/markdown",
  svg: "image/svg+xml",
  xml: "application/xml",
  csv: "text/csv",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  bmp: "image/bmp",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  mp4: "video/mp4",
  webm: "video/webm",
};

export function kindOf(name: string): FileKind {
  return TEXT_EXT[extOf(name)] ?? "asset";
}

export function mimeOf(name: string) {
  return MIME[extOf(name)] ?? "application/octet-stream";
}

export function isText(kind: FileKind) {
  return kind !== "asset";
}

export function makeFile(name: string, content = ""): PFile {
  return { id: uid(), name, kind: kindOf(name), content, mime: mimeOf(name) };
}

/** Normaliza "./a/../b.css?x#y" relativo a um diretório → "b.css" */
export function resolvePath(ref: string, fromDir = ""): string | null {
  if (!ref) return null;
  const clean = ref.trim().split(/[?#]/)[0];
  if (!clean || /^[a-z][a-z0-9+.-]*:/i.test(clean) || clean.startsWith("//")) return null;
  const parts = (clean.startsWith("/") ? clean.slice(1) : (fromDir ? fromDir + "/" : "") + clean).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (!p || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  try {
    return decodeURIComponent(out.join("/"));
  } catch {
    return out.join("/");
  }
}

export function findFile(files: PFile[], ref: string, fromDir = ""): PFile | undefined {
  const path = resolvePath(ref, fromDir);
  if (path == null) return undefined;
  const lower = path.toLowerCase();
  return (
    files.find((f) => f.name === path) ??
    files.find((f) => f.name.toLowerCase() === lower) ??
    // tolerância: o usuário importou só o arquivo, sem a pasta
    files.find((f) => baseName(f.name).toLowerCase() === baseName(lower))
  );
}

/* ---------- importação ---------- */

export interface Incoming {
  path: string;
  file: File;
}

function readAsText(file: File) {
  return file.text();
}

function readAsDataURL(file: File) {
  return new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

export async function readIncoming(list: Incoming[]): Promise<PFile[]> {
  // se tudo vier dentro de uma única pasta raiz, remove esse prefixo
  const roots = new Set(list.map((i) => (i.path.includes("/") ? i.path.split("/")[0] : "")));
  const strip = roots.size === 1 && !roots.has("") ? [...roots][0] + "/" : "";
  const out: PFile[] = [];
  for (const { path, file } of list) {
    const name = strip && path.startsWith(strip) ? path.slice(strip.length) : path;
    if (/(^|\/)(\.git|node_modules|\.DS_Store)(\/|$)/.test(name)) continue;
    const kind = kindOf(name);
    if (kind === "asset" && file.size > 8 * 1024 * 1024) continue; // ignora binários enormes
    const content = kind === "asset" ? await readAsDataURL(file) : await readAsText(file);
    out.push({ id: uid(), name, kind, content, mime: file.type || mimeOf(name) });
  }
  return out;
}

export function rootFolderName(list: Incoming[]): string | null {
  const roots = new Set(list.map((i) => (i.path.includes("/") ? i.path.split("/")[0] : "")));
  return roots.size === 1 && !roots.has("") ? [...roots][0] : null;
}

/** Lê itens de um drop, incluindo pastas inteiras. */
export async function collectDrop(dt: DataTransfer): Promise<Incoming[]> {
  const items = Array.from(dt.items || []);
  const entries = items
    .map((it) => (it.kind === "file" && "webkitGetAsEntry" in it ? it.webkitGetAsEntry() : null))
    .filter(Boolean) as FileSystemEntry[];
  if (!entries.length) return Array.from(dt.files).map((f) => ({ path: f.name, file: f }));
  const out: Incoming[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      out.push({ path: prefix + entry.name, file });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      let batch: FileSystemEntry[] = [];
      do {
        batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        for (const e of batch) await walk(e, prefix + entry.name + "/");
      } while (batch.length);
    }
  };
  for (const e of entries) await walk(e, "");
  return out;
}

export function fromInput(files: FileList | null): Incoming[] {
  return Array.from(files || []).map((f) => ({
    path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
    file: f,
  }));
}

export function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function dataURLToBytes(url: string): Uint8Array {
  const [head, body] = url.split(",");
  if (/;base64/i.test(head)) {
    const bin = atob(body);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }
  return new TextEncoder().encode(decodeURIComponent(body));
}

export function download(name: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function langLabel(kind: FileKind, name: string) {
  switch (kind) {
    case "html":
      return "HTML";
    case "css":
      return "CSS";
    case "js":
      return "JavaScript";
    case "json":
      return "JSON";
    case "asset":
      return "Binário";
    default:
      return extOf(name) === "svg" ? "SVG" : extOf(name) === "md" ? "Markdown" : "Texto";
  }
}
