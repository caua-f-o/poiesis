// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/* Histórico local de versões (snapshots), sem Git, nuvem nem rede.
 *
 * - Conteúdo endereçado por hash (SHA-256): cada versão diferente de um arquivo é guardada
 *   uma vez só; uma revisão é só um mapa caminho → hash.
 * - Uma revisão só aparece depois que todos os seus blobs foram gravados (mesma transação).
 * - Automáticas são podadas pela política de retenção; manuais e fixadas ficam até
 *   serem apagadas explicitamente. */
import type { FileKind, HistorySettings, PFile, Project } from "./types";
import { reqP, tx } from "./db";

export type Reason = "auto" | "manual" | "import" | "pre-restore" | "pre-delete" | "pre-replace" | "pre-rename" | "pre-import" | "pre-backup" | "pre-external" | "conflict";

export const REASON_LABEL: Record<Reason, string> = {
  auto: "Automático",
  manual: "Ponto manual",
  import: "Importação",
  "pre-restore": "Antes de restaurar",
  "pre-delete": "Antes de excluir",
  "pre-replace": "Antes de substituir",
  "pre-rename": "Antes de renomear",
  "pre-import": "Antes de importar",
  "pre-backup": "Antes de restaurar backup",
  "pre-external": "Antes de mudanças da pasta",
  conflict: "Conflito com a pasta",
};

export interface Entry {
  h: string;
  k: FileKind;
  m?: string;
}

export interface Revision {
  id: string;
  projectId: string;
  projectName: string;
  parentId: string | null;
  time: number;
  reason: Reason;
  label?: string;
  note?: string;
  pinned?: boolean;
  /** caminho → conteúdo (por hash) */
  entries: Record<string, Entry>;
  folders: string[];
  /** caminho do HTML principal */
  entry: string | null;
  /** resumo em relação à revisão anterior do mesmo projeto */
  stats: { added: number; removed: number; modified: number };
}

interface Blob {
  h: string;
  c: string;
  size: number;
}

export const DEFAULT_HISTORY: HistorySettings = { interval: 45, maxAuto: 150, maxFileSize: 5 * 1024 * 1024 };

/* ---------------- hash ---------------- */

const enc = new TextEncoder();
const hashCache = new Map<string, string>();

export async function hashOf(content: string): Promise<string> {
  const hit = hashCache.get(content);
  if (hit) return hit;
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(content));
  const h = Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  if (content.length < 2_000_000) {
    if (hashCache.size > 2000) hashCache.clear();
    hashCache.set(content, h);
  }
  return h;
}

const rid = () => Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);

/* ---------------- leitura ---------------- */

export async function listRevisions(projectId: string): Promise<Revision[]> {
  const list = await tx(["revisions"], "readonly", (t) => reqP(t.objectStore("revisions").index("project").getAll(projectId)) as Promise<Revision[]>);
  return list.sort((a, b) => b.time - a.time);
}

export async function getRevision(id: string): Promise<Revision | null> {
  return ((await tx(["revisions"], "readonly", (t) => reqP(t.objectStore("revisions").get(id)))) as Revision | undefined) ?? null;
}

/** Conteúdo de vários hashes de uma vez. */
export async function readBlobs(hashes: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(hashes)];
  return tx(["blobs"], "readonly", async (t) => {
    const s = t.objectStore("blobs");
    const out = new Map<string, string>();
    const got = await Promise.all(uniq.map((h) => reqP(s.get(h)) as Promise<Blob | undefined>));
    got.forEach((b, i) => b && out.set(uniq[i], b.c));
    return out;
  });
}

/** Arquivos (caminho → conteúdo) de uma revisão. */
export async function revisionFiles(rev: Revision): Promise<Map<string, string>> {
  const blobs = await readBlobs(Object.values(rev.entries).map((e) => e.h));
  const out = new Map<string, string>();
  for (const [path, e] of Object.entries(rev.entries)) {
    const c = blobs.get(e.h);
    if (c != null) out.set(path, c);
  }
  return out;
}

/* ---------------- comparação ---------------- */

export type FileStatus = "added" | "removed" | "modified" | "same";

export interface FileChange {
  path: string;
  status: FileStatus;
  kind: FileKind;
  before?: Entry;
  after?: Entry;
}

/** Diferença entre dois mapas de entradas (de → para). */
export function compareEntries(from: Record<string, Entry>, to: Record<string, Entry>): FileChange[] {
  const out: FileChange[] = [];
  for (const [path, a] of Object.entries(from)) {
    const b = to[path];
    if (!b) out.push({ path, status: "removed", kind: a.k, before: a });
    else out.push({ path, status: a.h === b.h ? "same" : "modified", kind: b.k, before: a, after: b });
  }
  for (const [path, b] of Object.entries(to)) if (!from[path]) out.push({ path, status: "added", kind: b.k, after: b });
  const rank: Record<FileStatus, number> = { modified: 0, added: 1, removed: 2, same: 3 };
  return out.sort((x, y) => rank[x.status] - rank[y.status] || x.path.localeCompare(y.path));
}

function stats(changes: FileChange[]) {
  return {
    added: changes.filter((c) => c.status === "added").length,
    removed: changes.filter((c) => c.status === "removed").length,
    modified: changes.filter((c) => c.status === "modified").length,
  };
}

/** Entradas do estado atual de um projeto (calcula hashes). */
export async function entriesOf(project: Project, maxFileSize = Infinity): Promise<{ entries: Record<string, Entry>; contents: Map<string, string>; skipped: string[] }> {
  const entries: Record<string, Entry> = {};
  const contents = new Map<string, string>();
  const skipped: string[] = [];
  for (const f of project.files) {
    if (f.content.length > maxFileSize) {
      skipped.push(f.name);
      continue;
    }
    const h = await hashOf(f.content);
    entries[f.name] = f.mime ? { h, k: f.kind, m: f.mime } : { h, k: f.kind };
    contents.set(h, f.content);
  }
  return { entries, contents, skipped };
}

const sameEntries = (a: Record<string, Entry>, b: Record<string, Entry>) => {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => b[k] && b[k].h === a[k].h);
};

/* ---------------- gravação ---------------- */

export interface SnapshotOptions {
  label?: string;
  note?: string;
  pinned?: boolean;
  /** limite de tamanho por arquivo (só para automáticos) */
  maxFileSize?: number;
}

/** Último snapshot por projeto, para não duplicar versão sem mudança. */
const lastByProject = new Map<string, Revision | null>();
/** Fila por projeto: snapshots do mesmo projeto não correm em paralelo. */
const queue = new Map<string, Promise<unknown>>();

async function latest(projectId: string): Promise<Revision | null> {
  if (!lastByProject.has(projectId)) lastByProject.set(projectId, (await listRevisions(projectId))[0] ?? null);
  return lastByProject.get(projectId) ?? null;
}

/**
 * Cria uma revisão do projeto. Devolve a revisão criada, ou a última existente quando
 * nada mudou (automáticos e pré-operações não duplicam conteúdo).
 */
export function createSnapshot(project: Project, reason: Reason, opts: SnapshotOptions = {}): Promise<Revision | null> {
  const run = async () => {
    const auto = reason === "auto";
    const { entries, contents } = await entriesOf(project, auto ? (opts.maxFileSize ?? Infinity) : Infinity);
    const prev = await latest(project.id);
    const manual = reason === "manual";
    if (prev && sameEntries(prev.entries, entries) && !manual) return prev;
    const entryFile = project.files.find((f) => f.id === project.entry)?.name ?? null;
    const rev: Revision = {
      id: rid(),
      projectId: project.id,
      projectName: project.name,
      parentId: prev?.id ?? null,
      time: Date.now(),
      reason,
      label: opts.label?.trim() || undefined,
      note: opts.note?.trim() || undefined,
      pinned: opts.pinned || undefined,
      entries,
      folders: [...(project.folders ?? [])],
      entry: entryFile,
      stats: stats(compareEntries(prev?.entries ?? {}, entries)),
    };
    await tx(["blobs", "revisions"], "readwrite", async (t) => {
      const bs = t.objectStore("blobs");
      // grava só os blobs que ainda não existem; a revisão entra na mesma transação
      const exists = await Promise.all([...contents.keys()].map((h) => reqP(bs.getKey(h))));
      [...contents.entries()].forEach(([h, c], i) => {
        if (exists[i] === undefined) bs.put({ h, c, size: c.length } satisfies Blob);
      });
      t.objectStore("revisions").put(rev);
    });
    lastByProject.set(project.id, rev);
    return rev;
  };
  const p = (queue.get(project.id) ?? Promise.resolve()).then(run, run);
  queue.set(
    project.id,
    p.catch(() => undefined)
  );
  return p;
}

export async function updateRevision(id: string, patch: Partial<Pick<Revision, "label" | "note" | "pinned">>) {
  await tx(["revisions"], "readwrite", async (t) => {
    const s = t.objectStore("revisions");
    const r = (await reqP(s.get(id))) as Revision | undefined;
    if (r) s.put({ ...r, ...patch });
  });
  lastByProject.clear();
}

export async function deleteRevisions(ids: string[]) {
  await tx(["revisions"], "readwrite", (t) => {
    for (const id of ids) t.objectStore("revisions").delete(id);
  });
  lastByProject.clear();
  await collectGarbage();
}

/* ---------------- retenção e espaço ---------------- */

/** Mantém as `maxAuto` automáticas mais novas (fixadas nunca saem). */
export async function prune(projectId: string, maxAuto: number): Promise<number> {
  const list = await listRevisions(projectId);
  const autos = list.filter((r) => r.reason === "auto" && !r.pinned);
  const drop = autos.slice(maxAuto).map((r) => r.id);
  if (!drop.length) return 0;
  await deleteRevisions(drop);
  return drop.length;
}

/** Apaga blobs que nenhuma revisão usa mais. */
export async function collectGarbage(): Promise<number> {
  return tx(["blobs", "revisions"], "readwrite", async (t) => {
    const revs = (await reqP(t.objectStore("revisions").getAll())) as Revision[];
    const used = new Set<string>();
    for (const r of revs) for (const e of Object.values(r.entries)) used.add(e.h);
    const keys = (await reqP(t.objectStore("blobs").getAllKeys())) as string[];
    let n = 0;
    for (const k of keys)
      if (!used.has(k)) {
        t.objectStore("blobs").delete(k);
        n++;
      }
    return n;
  });
}

export interface HistoryUsage {
  revisions: number;
  bytes: number;
  /** revisões de projetos que não existem mais */
  orphans: number;
}

export async function historyUsage(projectIds: string[]): Promise<HistoryUsage> {
  return tx(["blobs", "revisions"], "readonly", async (t) => {
    const revs = (await reqP(t.objectStore("revisions").getAll())) as Revision[];
    const blobs = (await reqP(t.objectStore("blobs").getAll())) as Blob[];
    const alive = new Set(projectIds);
    return { revisions: revs.length, bytes: blobs.reduce((n, b) => n + b.size, 0), orphans: revs.filter((r) => !alive.has(r.projectId)).length };
  });
}

export async function deleteOrphans(projectIds: string[]) {
  const alive = new Set(projectIds);
  const revs = await tx(["revisions"], "readonly", (t) => reqP(t.objectStore("revisions").getAll()) as Promise<Revision[]>);
  await deleteRevisions(revs.filter((r) => !alive.has(r.projectId)).map((r) => r.id));
}

/* ---------------- restauração ---------------- */

const uid = () => Math.random().toString(36).slice(2, 10);

/**
 * Monta o projeto restaurado. Sem `paths`, restaura o projeto inteiro (arquivos que não
 * existiam na revisão são removidos); com `paths`, só esses arquivos. Ids de arquivos que
 * continuam existindo são mantidos, para não fechar abas nem quebrar referências.
 */
export async function restoreProject(project: Project, rev: Revision, paths?: string[]): Promise<Project> {
  const files = await revisionFiles(rev);
  const byName = new Map(project.files.map((f) => [f.name, f]));
  const make = (path: string): PFile | null => {
    const e = rev.entries[path];
    const content = files.get(path);
    if (!e || content == null) return null;
    const cur = byName.get(path);
    return { id: cur?.id ?? uid(), name: path, kind: e.k, content, ...(e.m ? { mime: e.m } : {}) };
  };
  if (paths) {
    let next = [...project.files];
    for (const path of paths) {
      const f = make(path);
      if (f) {
        const i = next.findIndex((x) => x.name === path);
        if (i >= 0) next[i] = f;
        else next.push(f);
      } else next = next.filter((x) => x.name !== path); // não existia na revisão: remove
    }
    return fixRefs({ ...project, files: next });
  }
  const restored = Object.keys(rev.entries)
    .map(make)
    .filter((f): f is PFile => !!f);
  const entry = restored.find((f) => f.name === rev.entry)?.id ?? restored.find((f) => f.kind === "html")?.id ?? "";
  return fixRefs({ ...project, files: restored, folders: [...rev.folders], entry });
}

function fixRefs(p: Project): Project {
  const ids = new Set(p.files.map((f) => f.id));
  const openTabs = p.openTabs.filter((id) => ids.has(id));
  const entry = ids.has(p.entry) ? p.entry : (p.files.find((f) => f.kind === "html")?.id ?? "");
  return { ...p, openTabs, activeFile: p.activeFile && ids.has(p.activeFile) ? p.activeFile : (openTabs[0] ?? null), entry, updatedAt: Date.now() };
}

/* ---------------- exportar / importar ---------------- */

export interface HistoryExport {
  format: "poiesis-history";
  version: 1;
  exportedAt: number;
  projectId: string;
  projectName: string;
  revisions: Revision[];
  blobs: Record<string, string>;
}

export async function exportHistory(project: Project): Promise<HistoryExport> {
  const revisions = await listRevisions(project.id);
  const blobs = await readBlobs(revisions.flatMap((r) => Object.values(r.entries).map((e) => e.h)));
  return { format: "poiesis-history", version: 1, exportedAt: Date.now(), projectId: project.id, projectName: project.name, revisions, blobs: Object.fromEntries(blobs) };
}

/**
 * Importa um histórico exportado para o projeto `targetId`. Confere o hash de cada blob
 * (arquivo adulterado ou corrompido é recusado) e ignora revisões que já existem.
 */
export async function importHistory(data: unknown, targetId: string): Promise<{ added: number; skipped: number }> {
  const d = data as HistoryExport;
  if (!d || d.format !== "poiesis-history" || d.version !== 1 || !Array.isArray(d.revisions) || typeof d.blobs !== "object") {
    throw new Error("Arquivo não é um histórico do Poiesis (formato ou versão desconhecidos).");
  }
  for (const [h, c] of Object.entries(d.blobs)) {
    if (typeof c !== "string" || (await hashOf(c)) !== h) throw new Error("Integridade: um dos arquivos do histórico não confere com o hash. Nada foi importado.");
  }
  for (const r of d.revisions) {
    if (!r || typeof r.id !== "string" || typeof r.entries !== "object") throw new Error("Revisão inválida no arquivo. Nada foi importado.");
    for (const e of Object.values(r.entries)) if (!(e.h in d.blobs)) throw new Error("Revisão aponta para conteúdo ausente. Nada foi importado.");
  }
  const existing = new Set((await listRevisions(targetId)).map((r) => r.id));
  const fresh = d.revisions.filter((r) => !existing.has(r.id));
  await tx(["blobs", "revisions"], "readwrite", (t) => {
    for (const [h, c] of Object.entries(d.blobs)) t.objectStore("blobs").put({ h, c, size: c.length } satisfies Blob);
    for (const r of fresh) t.objectStore("revisions").put({ ...r, projectId: targetId });
  });
  lastByProject.delete(targetId);
  return { added: fresh.length, skipped: d.revisions.length - fresh.length };
}
