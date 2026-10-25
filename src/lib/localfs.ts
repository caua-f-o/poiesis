// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/* Pasta local: um projeto do Poiesis ligado a uma pasta real do computador
 * (File System Access API). Nada aqui usa rede; o acesso é concedido pelo usuário,
 * pasta por pasta, pelo seletor do sistema. O identificador da pasta fica no IndexedDB. */
import type { PFile } from "./types";
import { kindOf, mimeOf, uid, dataURLToBytes } from "./files";
import { reqP, tx } from "./db";
import { hashOf } from "./history";

/* ---------- tipos que o lib.dom ainda não traz ---------- */
type PermState = "granted" | "denied" | "prompt";
interface PermHandle {
  queryPermission?(o: { mode: "read" | "readwrite" }): Promise<PermState>;
  requestPermission?(o: { mode: "read" | "readwrite" }): Promise<PermState>;
}
type Dir = FileSystemDirectoryHandle & PermHandle & { entries(): AsyncIterable<[string, FileSystemHandle]> };

declare global {
  interface Window {
    showDirectoryPicker?(o?: { id?: string; mode?: "read" | "readwrite"; startIn?: string }): Promise<FileSystemDirectoryHandle>;
    /** só nos testes E2E: devolve uma pasta (do OPFS) no lugar do seletor do sistema */
    __poiesisTestPickDirectory?: () => Promise<FileSystemDirectoryHandle>;
    FileSystemObserver?: new (cb: (records: unknown[]) => void) => { observe(h: FileSystemHandle, o?: { recursive?: boolean }): Promise<void>; disconnect(): void };
  }
}

export const folderSupported = () => typeof window !== "undefined" && (!!window.showDirectoryPicker || !!window.__poiesisTestPickDirectory);

/* ---------- vínculo guardado ---------- */

/** Estado de cada arquivo na última sincronização: data de modificação, tamanho e hash do conteúdo. */
export type SyncState = Record<string, { m: number; s: number; h: string }>;

export interface FolderLink {
  projectId: string;
  handle: FileSystemDirectoryHandle;
  /** nome da pasta (o navegador não revela o caminho completo) */
  name: string;
  linkedAt: number;
  state: SyncState;
  /** pastas vazias conhecidas */
  dirs: string[];
}

export async function getLink(projectId: string): Promise<FolderLink | null> {
  return ((await tx(["links"], "readonly", (t) => reqP(t.objectStore("links").get(projectId)))) as FolderLink | undefined) ?? null;
}

export async function allLinks(): Promise<FolderLink[]> {
  return (await tx(["links"], "readonly", (t) => reqP(t.objectStore("links").getAll()))) as FolderLink[];
}

export async function saveLink(link: FolderLink) {
  await tx(["links"], "readwrite", (t) => {
    t.objectStore("links").put(link);
  });
}

export async function removeLink(projectId: string) {
  await tx(["links"], "readwrite", (t) => {
    t.objectStore("links").delete(projectId);
  });
}

/* ---------- seletor e permissão ---------- */

export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    if (window.__poiesisTestPickDirectory) return await window.__poiesisTestPickDirectory();
    if (!window.showDirectoryPicker) return null;
    return await window.showDirectoryPicker({ id: "poiesis", mode: "readwrite" });
  } catch (e) {
    if ((e as DOMException)?.name === "AbortError") return null; // usuário cancelou
    throw e;
  }
}

/** Confere (e, se `ask`, pede) permissão de leitura e escrita. `ask` exige um gesto do usuário. */
export async function ensurePermission(handle: FileSystemDirectoryHandle, ask: boolean): Promise<PermState> {
  const h = handle as Dir;
  try {
    const now = (await h.queryPermission?.({ mode: "readwrite" })) ?? "granted";
    if (now === "granted" || !ask) return now;
    return (await h.requestPermission?.({ mode: "readwrite" })) ?? "denied";
  } catch {
    return "denied";
  }
}

/** A pasta ainda existe e responde? (apagada, movida ou disco removido → false) */
export async function folderAlive(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const it = (handle as Dir).entries();
    await it[Symbol.asyncIterator]().next();
    return true;
  } catch {
    return false;
  }
}

/* ---------- ignorados e limites ---------- */

export const DEFAULT_IGNORE = "node_modules, .git, dist, build, .DS_Store, Thumbs.db";

export interface FolderLimits {
  maxFiles: number;
  /** bytes por arquivo */
  maxFile: number;
  /** bytes no total */
  maxTotal: number;
}
export const LIMITS: FolderLimits = { maxFiles: 2000, maxFile: 20 * 1024 * 1024, maxTotal: 300 * 1024 * 1024 };

/** Converte padrões simples (nomes, `*.ext`, `pasta/`) num teste de caminho. */
export function ignoreMatcher(patterns: string[]): (path: string) => boolean {
  const res = patterns
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith("#") && !p.startsWith("!"))
    .map((p) => {
      const anchored = p.startsWith("/");
      const body = p.replace(/^\/+|\/+$/g, "");
      const glob = body
        .split("")
        .map((c) => (c === "*" ? "[^/]*" : c === "?" ? "[^/]" : /[.+^${}()|[\]\\]/.test(c) ? "\\" + c : c))
        .join("")
        .replace(/\[\^\/\]\*\[\^\/\]\*/g, ".*"); // **
      return new RegExp((anchored ? "^" : "(^|/)") + glob + "(/|$)");
    });
  return (path) => res.some((r) => r.test(path));
}

export function parseIgnoreSetting(s: string): string[] {
  return s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
}

/* ---------- leitura ---------- */

export interface ReadResult {
  files: PFile[];
  dirs: string[];
  state: SyncState;
  /** caminhos deixados de fora, com o motivo */
  skipped: { path: string; why: string }[];
}

interface Walked {
  path: string;
  handle: FileSystemFileHandle;
}

async function walk(dir: FileSystemDirectoryHandle, ignored: (p: string) => boolean, limits: FolderLimits, skipped: ReadResult["skipped"]) {
  const files: Walked[] = [];
  const dirs: string[] = [];
  const rec = async (d: FileSystemDirectoryHandle, prefix: string) => {
    const entries: [string, FileSystemHandle][] = [];
    for await (const e of (d as Dir).entries()) entries.push(e);
    entries.sort(([a], [b]) => a.localeCompare(b));
    let hasChild = false;
    for (const [name, h] of entries) {
      const path = prefix + name;
      if (ignored(path)) continue;
      hasChild = true;
      if (h.kind === "directory") await rec(h as FileSystemDirectoryHandle, path + "/");
      else if (files.length >= limits.maxFiles) skipped.push({ path, why: `mais de ${limits.maxFiles} arquivos` });
      else files.push({ path, handle: h as FileSystemFileHandle });
    }
    if (!hasChild && prefix) dirs.push(prefix.slice(0, -1));
  };
  await rec(dir, "");
  return { files, dirs };
}

/** Lê o .gitignore da raiz, se existir. */
async function gitignore(dir: FileSystemDirectoryHandle): Promise<string[]> {
  try {
    const f = await (await dir.getFileHandle(".gitignore")).getFile();
    return (await f.text()).split(/\r?\n/);
  } catch {
    return [];
  }
}

function readAsDataURL(file: File) {
  return new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

async function readOne(path: string, file: File): Promise<{ content: string; kind: PFile["kind"]; mime: string }> {
  const kind = kindOf(path);
  const content = kind === "asset" ? await readAsDataURL(file) : await file.text();
  return { content, kind, mime: file.type || mimeOf(path) };
}

export async function readFolder(dir: FileSystemDirectoryHandle, ignore: string[], idFor: (path: string) => string = () => uid(), limits = LIMITS): Promise<ReadResult> {
  const skipped: ReadResult["skipped"] = [];
  const ignored = ignoreMatcher([...ignore, ...(await gitignore(dir))]);
  const { files: walked, dirs } = await walk(dir, ignored, limits, skipped);
  const files: PFile[] = [];
  const state: SyncState = {};
  let total = 0;
  for (const w of walked) {
    const file = await w.handle.getFile();
    if (file.size > limits.maxFile) {
      skipped.push({ path: w.path, why: `maior que ${Math.round(limits.maxFile / 1024 / 1024)} MB` });
      continue;
    }
    if (total + file.size > limits.maxTotal) {
      skipped.push({ path: w.path, why: "passou do limite total do projeto" });
      continue;
    }
    total += file.size;
    const r = await readOne(w.path, file);
    files.push({ id: idFor(w.path), name: w.path, ...r });
    state[w.path] = { m: file.lastModified, s: file.size, h: await hashOf(r.content) };
  }
  return { files, dirs, state, skipped };
}

/* ---------- escrita ---------- */

async function dirFor(root: FileSystemDirectoryHandle, path: string, create: boolean): Promise<FileSystemDirectoryHandle> {
  let d = root;
  for (const part of path.split("/").filter(Boolean)) d = await d.getDirectoryHandle(part, { create });
  return d;
}

const split = (path: string) => {
  const i = path.lastIndexOf("/");
  return i < 0 ? ["", path] : [path.slice(0, i), path.slice(i + 1)];
};

/** Grava um arquivo. O Chrome escreve num temporário e só troca no `close()`: nunca fica pela metade. */
export async function writeFile(root: FileSystemDirectoryHandle, f: PFile): Promise<{ m: number; s: number; h: string }> {
  const [dir, name] = split(f.name);
  const fh = await (await dirFor(root, dir, true)).getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  try {
    await w.write(f.kind === "asset" ? (dataURLToBytes(f.content) as BlobPart) : f.content);
    await w.close();
  } catch (e) {
    await w.abort().catch(() => undefined);
    throw e;
  }
  const file = await fh.getFile();
  return { m: file.lastModified, s: file.size, h: await hashOf(f.content) };
}

/**
 * O arquivo mudou no disco desde a última sincronização (por fora do Poiesis)?
 * Usado antes de sobrescrever, para não apagar uma edição feita em outro programa.
 */
export async function changedOnDisk(root: FileSystemDirectoryHandle, path: string, known: { m: number; s: number; h: string } | undefined): Promise<boolean> {
  const [dir, name] = split(path);
  let file: File;
  try {
    file = await (await (await dirFor(root, dir, false)).getFileHandle(name)).getFile();
  } catch (e) {
    if ((e as DOMException)?.name === "NotFoundError") return false; // não existe: gravar cria
    throw e;
  }
  if (!known) return true; // existe no disco mas nunca foi sincronizado: é de outra origem
  if (file.lastModified === known.m && file.size === known.s) return false;
  const r = await readOne(path, file);
  return (await hashOf(r.content)) !== known.h;
}

export async function deletePath(root: FileSystemDirectoryHandle, path: string, recursive = false) {
  const [dir, name] = split(path);
  try {
    await (await dirFor(root, dir, false)).removeEntry(name, { recursive });
  } catch (e) {
    if ((e as DOMException)?.name !== "NotFoundError") throw e;
  }
}

export async function ensureDir(root: FileSystemDirectoryHandle, path: string) {
  await dirFor(root, path, true);
}

/** A pasta está vazia (desconsiderando os ignorados)? */
export async function folderIsEmpty(dir: FileSystemDirectoryHandle, ignore: string[]): Promise<boolean> {
  const ignored = ignoreMatcher(ignore);
  for await (const [name] of (dir as Dir).entries()) if (!ignored(name)) return false;
  return true;
}

/* ---------- mudanças feitas fora do Poiesis ---------- */

export interface DiskChange {
  path: string;
  type: "added" | "modified" | "removed";
  /** conteúdo novo (added/modified) */
  file?: { content: string; kind: PFile["kind"]; mime: string; m: number; s: number; h: string };
}

/**
 * Compara a pasta com o estado da última sincronização. Só lê o conteúdo de quem mudou
 * de data ou tamanho; um "toque" sem mudança de conteúdo (mesmo hash) é ignorado.
 */
export async function scanChanges(dir: FileSystemDirectoryHandle, state: SyncState, ignore: string[], limits = LIMITS): Promise<{ changes: DiskChange[]; dirs: string[] }> {
  const skipped: ReadResult["skipped"] = [];
  const ignored = ignoreMatcher([...ignore, ...(await gitignore(dir))]);
  const { files, dirs } = await walk(dir, ignored, limits, skipped);
  const changes: DiskChange[] = [];
  const seen = new Set<string>();
  for (const w of files) {
    seen.add(w.path);
    const file = await w.handle.getFile();
    const known = state[w.path];
    if (known && known.m === file.lastModified && known.s === file.size) continue;
    if (file.size > limits.maxFile) continue;
    const r = await readOne(w.path, file);
    const h = await hashOf(r.content);
    if (known && known.h === h) {
      // só a data mudou: atualiza o estado sem considerar mudança
      state[w.path] = { m: file.lastModified, s: file.size, h };
      continue;
    }
    changes.push({ path: w.path, type: known ? "modified" : "added", file: { ...r, m: file.lastModified, s: file.size, h } });
  }
  for (const path of Object.keys(state)) if (!seen.has(path) && !ignored(path)) changes.push({ path, type: "removed" });
  return { changes, dirs };
}

/** Observa a pasta quando o navegador permite (FileSystemObserver); devolve a função de parar. */
export function observeFolder(dir: FileSystemDirectoryHandle, onChange: () => void): () => void {
  const Obs = window.FileSystemObserver;
  if (!Obs) return () => undefined;
  try {
    const o = new Obs(() => onChange());
    o.observe(dir, { recursive: true }).catch(() => undefined);
    return () => o.disconnect();
  } catch {
    return () => undefined;
  }
}
