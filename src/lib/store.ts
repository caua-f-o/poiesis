import type { Project, Settings, Workspace } from "./types";
import { TEMPLATES } from "./templates";

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
  console: true,
  device: "full",
  landscape: false,
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
  ws.order = ws.order.filter((id) => ws.projects[id]);
  if (!ws.order.length) return freshWorkspace();
  if (!ws.projects[ws.currentId]) ws.currentId = ws.order[0];
  return ws;
}

export async function loadWorkspace(): Promise<Workspace> {
  try {
    if (isExtension()) {
      const r = await chrome.storage.local.get(KEY);
      return sanitize(r?.[KEY]);
    }
    const raw = localStorage.getItem(KEY);
    return sanitize(raw ? JSON.parse(raw) : null);
  } catch {
    return freshWorkspace();
  }
}

export async function saveWorkspace(ws: Workspace): Promise<boolean> {
  try {
    if (isExtension()) {
      await chrome.storage.local.set({ [KEY]: ws });
    } else {
      localStorage.setItem(KEY, JSON.stringify(ws));
    }
    return true;
  } catch {
    return false;
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
