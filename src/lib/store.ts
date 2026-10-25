// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
import type { Project, Settings, Workspace } from "./types";
import { TEMPLATES } from "./templates";
import { dbErrorMessage, reqP, tx } from "./db";
import { DEFAULT_HISTORY } from "./history";

const KEY = "poiesis:workspace:v1";

declare const chrome: any;

export const isExtension = () => typeof chrome !== "undefined" && !!chrome?.runtime?.id && !!chrome?.storage?.local;

export const DEFAULT_SETTINGS: Settings = {
  autoRun: true,
  delay: 450,
  layout: "split",
  fontSize: 13.5,
  wrap: false,
  tabSize: 2,
  emmet: true,
  autoInject: true,
  clearOnRun: true,
  sidebar: true,
  panel: "files",
  theme: "tinta",
  hoverDocs: true,
  console: true,
  device: "full",
  landscape: false,
  history: { ...DEFAULT_HISTORY },
  localFolders: false,
  folderIgnore: "node_modules, .git, dist, build, .DS_Store, Thumbs.db",
};

export function newProject(templateId = "gênese", name?: string): Project {
  const t = TEMPLATES.find((x) => x.id === templateId) ?? TEMPLATES[0];
  const files = t.files();
  const entry = files.find((f) => f.name === "index.html") ?? files.find((f) => f.kind === "html") ?? files[0];
  const now = Date.now();
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: name ?? t.projectName,
    files,
    entry: entry?.id ?? "",
    folders: [],
    openTabs: files.filter((f) => f.kind !== "asset").map((f) => f.id),
    activeFile: entry?.id ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export function freshWorkspace(): Workspace {
  const p = newProject("gênese");
  return { version: 1, projects: { [p.id]: p }, order: [p.id], currentId: p.id, settings: { ...DEFAULT_SETTINGS } };
}

function sanitize(ws: Workspace | null | undefined): Workspace {
  if (!ws || ws.version !== 1 || !ws.order?.length) return freshWorkspace();
  ws.settings = { ...DEFAULT_SETTINGS, ...(ws.settings || {}) };
  ws.settings.history = { ...DEFAULT_HISTORY, ...(ws.settings.history || {}) };
  ws.order = ws.order.filter((id) => ws.projects[id]);
  if (!ws.order.length) return freshWorkspace();
  if (!ws.projects[ws.currentId]) ws.currentId = ws.order[0];
  return ws;
}

/* ---------- persistência (IndexedDB, um registro por projeto) ----------
 * Antes da 2.4 o workspace inteiro ficava numa chave só do chrome.storage.local.
 * Na primeira abertura ele é copiado para o IndexedDB, conferido e só então marcado
 * como migrado. A cópia antiga continua no chrome.storage como reserva. */

type Meta = Omit<Workspace, "projects">;
const META_KEY = "workspace";
const MIGRATED_KEY = "migrated-from-storage";

/** Projetos como foram gravados por último — só o que mudou é regravado. */
let saved = new Map<string, Project>();
let savedMeta = "";
/** IndexedDB indisponível: continua gravando no armazenamento antigo. */
let fallback = false;

async function writeLegacy(ws: Workspace) {
  if (isExtension()) await chrome.storage.local.set({ [KEY]: ws });
  else localStorage.setItem(KEY, JSON.stringify(ws));
}

async function readLegacy(): Promise<Workspace | null> {
  try {
    if (isExtension()) {
      const r = await chrome.storage.local.get(KEY);
      return r?.[KEY] ?? null;
    }
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function readDb(): Promise<{ ws: Workspace | null; migrated: boolean }> {
  return tx(["meta", "projects"], "readonly", async (t) => {
    const meta = (await reqP(t.objectStore("meta").get(META_KEY))) as Meta | undefined;
    const migrated = !!(await reqP(t.objectStore("meta").get(MIGRATED_KEY)));
    if (!meta) return { ws: null, migrated };
    const list = (await reqP(t.objectStore("projects").getAll())) as Project[];
    const projects: Record<string, Project> = {};
    for (const p of list) projects[p.id] = p;
    return { ws: { ...meta, projects }, migrated };
  });
}

function metaOf(ws: Workspace): Meta {
  const { projects: _p, ...meta } = ws;
  return meta;
}

async function writeAll(ws: Workspace, extra?: Record<string, unknown>) {
  await tx(["meta", "projects"], "readwrite", (t) => {
    const ps = t.objectStore("projects");
    ps.clear();
    for (const id of Object.keys(ws.projects)) ps.put(ws.projects[id]);
    t.objectStore("meta").put(metaOf(ws), META_KEY);
    for (const [k, v] of Object.entries(extra ?? {})) t.objectStore("meta").put(v, k);
  });
}

function remember(ws: Workspace) {
  saved = new Map(Object.entries(ws.projects));
  savedMeta = JSON.stringify(metaOf(ws));
}

export type LoadResult = { ws: Workspace; migrated: boolean; error?: string };

export async function loadWorkspace(): Promise<LoadResult> {
  try {
    const { ws, migrated } = await readDb();
    if (ws) {
      const clean = sanitize(ws);
      remember(clean);
      return { ws: clean, migrated: false };
    }
    // primeira abertura nesta versão: migra do armazenamento antigo
    const legacy = await readLegacy();
    const clean = sanitize(legacy);
    await writeAll(clean, { [MIGRATED_KEY]: { at: Date.now(), from: legacy ? "chrome.storage.local" : "nada (instalação nova)" } });
    const check = await readDb();
    const ok = check.ws && Object.keys(check.ws.projects).length === Object.keys(clean.projects).length;
    if (!ok) throw new Error("a cópia para o banco local não conferiu");
    remember(clean);
    return { ws: clean, migrated: !!legacy && !migrated };
  } catch (e) {
    // banco indisponível: segue com o armazenamento antigo para não perder nada
    fallback = true;
    const legacy = sanitize(await readLegacy());
    return { ws: legacy, migrated: false, error: dbErrorMessage(e) };
  }
}

/** Grava só o que mudou (meta + projetos alterados/removidos) numa transação única. */
export async function saveWorkspace(ws: Workspace): Promise<{ ok: boolean; error?: string }> {
  try {
    if (fallback) {
      await writeLegacy(ws);
      return { ok: true };
    }
    const changed = Object.values(ws.projects).filter((p) => saved.get(p.id) !== p);
    const removed = [...saved.keys()].filter((id) => !ws.projects[id]);
    const meta = JSON.stringify(metaOf(ws));
    if (!changed.length && !removed.length && meta === savedMeta) return { ok: true };
    await tx(["meta", "projects"], "readwrite", (t) => {
      const ps = t.objectStore("projects");
      for (const p of changed) ps.put(p);
      for (const id of removed) ps.delete(id);
      if (meta !== savedMeta) t.objectStore("meta").put(metaOf(ws), META_KEY);
    });
    for (const p of changed) saved.set(p.id, p);
    for (const id of removed) saved.delete(id);
    savedMeta = meta;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
}

/* ---------- janela de preview destacada ---------- */
export const POPOUT_KEY = "poiesis:popout";

export async function pushPopout(html: string, title: string) {
  if (!isExtension()) return;
  try {
    await chrome.storage.local.set({ [POPOUT_KEY]: { html, title, t: Date.now() } });
  } catch {
    /* ignora */
  }
}

export function openPopout() {
  if (isExtension()) chrome.tabs.create({ url: chrome.runtime.getURL("preview.html") });
}
