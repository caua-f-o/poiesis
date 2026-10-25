// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/* Sincronização de um projeto com uma pasta do computador.
 *
 * - Editor → disco: depois de cada mudança (com debounce), grava só os arquivos cujo
 *   conteúdo difere do que foi sincronizado por último; apaga do disco o que saiu do projeto.
 * - Disco → editor: varre a pasta ao focar a aba, a cada poucos segundos e quando o
 *   navegador avisa (FileSystemObserver). Sem edição local pendente, aplica a mudança;
 *   com edição pendente no mesmo arquivo, é conflito: as duas versões ficam no histórico
 *   e o comparador abre.
 * - Sem permissão ou sem a pasta, o projeto fica somente leitura até reconectar. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { PFile, Project } from "./types";
import { hashOf, type Reason, type Revision } from "./history";
import {
  DEFAULT_IGNORE,
  allLinks,
  deletePath,
  ensureDir,
  ensurePermission,
  folderAlive,
  folderIsEmpty,
  getLink,
  observeFolder,
  parseIgnoreSetting,
  pickDirectory,
  readFolder,
  removeLink,
  saveLink,
  scanChanges,
  writeFile,
  changedOnDisk,
  type FolderLink,
  type ReadResult,
} from "./localfs";
import { uid } from "./files";

export type FolderState = "linked" | "permission" | "missing" | "error";

export interface FolderStatus {
  state: FolderState;
  name: string;
  error?: string;
  /** gravações em andamento */
  busy?: boolean;
  lastSync?: number;
  skipped?: ReadResult["skipped"];
}

interface Options {
  enabled: boolean;
  ignore: string;
  project: Project | null;
  updateProject(fn: (p: Project) => Project, touch?: boolean): void;
  checkpoint(reason: Reason, p?: Project | null, opts?: { label?: string; note?: string }): Promise<Revision | null>;
  onConflict(rev: Revision, paths: string[]): void;
  notify(kind: "info" | "success" | "error" | "warning", title: string, description?: string): void;
}

const POLL_MS = 4000;
const WRITE_DEBOUNCE = 600;

const errName = (e: unknown) => (e as DOMException)?.name ?? "";
const humanError = (e: unknown) => {
  const n = errName(e);
  if (n === "NotAllowedError" || n === "SecurityError") return "Sem permissão para acessar a pasta.";
  if (n === "NotFoundError") return "A pasta (ou um arquivo dela) não foi encontrada.";
  if (n === "QuotaExceededError") return "Sem espaço no disco.";
  if (n === "NoModificationAllowedError") return "O arquivo está bloqueado por outro programa.";
  return (e as Error)?.message || String(e);
};

export function useFolderSync(o: Options) {
  const [status, setStatus] = useState<Record<string, FolderStatus>>({});
  const links = useRef(new Map<string, FolderLink>());
  const opts = useRef(o);
  opts.current = o;
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  /** última versão do projeto vista pelo gravador */
  const pending = useRef<Project | null>(null);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const status_ = useRef(status);
  status_.current = status;

  const ignoreList = () => parseIgnoreSetting(opts.current.ignore || DEFAULT_IGNORE);
  const patch = useCallback((id: string, p: Partial<FolderStatus> | null) => {
    setStatus((s) => {
      if (p === null) {
        const { [id]: _drop, ...rest } = s;
        return rest;
      }
      return { ...s, [id]: { ...(s[id] ?? { state: "linked", name: links.current.get(id)?.name ?? "" }), ...p } };
    });
  }, []);

  /** Executa operações de disco uma de cada vez (gravação e varredura nunca se cruzam). */
  const serial = useCallback(<T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(fn, fn);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  const fail = useCallback(
    (id: string, e: unknown) => {
      const n = errName(e);
      const state: FolderState = n === "NotAllowedError" || n === "SecurityError" ? "permission" : n === "NotFoundError" ? "missing" : "error";
      patch(id, { state, error: humanError(e), busy: false });
    },
    [patch]
  );

  /* ---------- carregar vínculos ---------- */
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    allLinks()
      .then((ls) => {
        for (const l of ls) links.current.set(l.projectId, l);
        setStatus(Object.fromEntries(ls.map((l) => [l.projectId, { state: "permission" as FolderState, name: l.name }])));
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  /* ---------- editor → disco ---------- */
  const flushWrites = useCallback(
    (p: Project) =>
      serial(async () => {
        const link = links.current.get(p.id);
        if (!link) return;
        const st = status_.current[p.id];
        if (st && st.state !== "linked") return;
        const state = { ...link.state };
        const want = new Map(p.files.map((f) => [f.name, f]));
        const writes: PFile[] = [];
        for (const f of p.files) {
          const h = await hashOf(f.content);
          if (state[f.name]?.h !== h) writes.push(f);
        }
        const deletes = Object.keys(state).filter((path) => !want.has(path));
        const folders = (p.folders ?? []).filter((d) => !link.dirs.includes(d));
        if (!writes.length && !deletes.length && !folders.length && link.dirs.every((d) => (p.folders ?? []).includes(d))) return;
        patch(p.id, { busy: true });
        const blocked: string[] = [];
        try {
          for (const f of writes) {
            // mudou no disco por fora desde a última sincronização? não sobrescreve: vira conflito
            if (await changedOnDisk(link.handle, f.name, state[f.name])) {
              blocked.push(f.name);
              continue;
            }
            state[f.name] = await writeFile(link.handle, f);
          }
          for (const path of deletes) {
            await deletePath(link.handle, path);
            delete state[path];
          }
          for (const d of folders) await ensureDir(link.handle, d);
          // pastas que ficaram vazias porque saíram do projeto: remove sem recursão (nunca apaga o que não vemos)
          const alive = new Set([...(p.folders ?? []), ...p.files.map((f) => f.name.split("/").slice(0, -1).join("/")).filter(Boolean)]);
          const gone = new Set<string>();
          for (const path of deletes) {
            const parts = path.split("/").slice(0, -1);
            for (let i = parts.length; i > 0; i--) gone.add(parts.slice(0, i).join("/"));
          }
          for (const d of link.dirs) if (!(p.folders ?? []).includes(d)) gone.add(d);
          for (const d of [...gone].sort((a, b) => b.length - a.length)) {
            if ([...alive].some((a) => a === d || a.startsWith(d + "/"))) continue;
            await deletePath(link.handle, d, false).catch(() => undefined); // não vazia → fica
          }
          link.state = state;
          link.dirs = [...(p.folders ?? [])];
          await saveLink(link);
          patch(p.id, { busy: false, lastSync: Date.now(), state: "linked", error: undefined });
          if (blocked.length) setTimeout(() => scanRef.current(p.id), 0); // a varredura trata como conflito
        } catch (e) {
          link.state = state; // o que já foi gravado continua valendo
          await saveLink(link).catch(() => undefined);
          fail(p.id, e);
          opts.current.notify("error", "Não foi possível gravar na pasta", humanError(e));
        }
      }),
    [serial, patch, fail]
  );

  // agenda gravação a cada mudança do projeto atual
  useEffect(() => {
    const p = o.project;
    // trocou de projeto com gravação agendada: grava a do anterior agora
    if (writeTimer.current && pending.current && pending.current.id !== p?.id) {
      clearTimeout(writeTimer.current);
      writeTimer.current = null;
      flushWrites(pending.current);
    }
    if (!p || !links.current.has(p.id) || status[p.id]?.state !== "linked") return;
    pending.current = p;
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => {
      writeTimer.current = null;
      if (pending.current) flushWrites(pending.current);
    }, WRITE_DEBOUNCE);
  }, [o.project?.files, o.project?.folders, status[o.project?.id ?? ""]?.state]); // eslint-disable-line react-hooks/exhaustive-deps

  // fechando a aba: tenta gravar o que estava agendado
  useEffect(() => {
    const flush = () => {
      if (writeTimer.current && pending.current) {
        clearTimeout(writeTimer.current);
        writeTimer.current = null;
        flushWrites(pending.current);
      }
    };
    const onHide = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [flushWrites]);

  /* ---------- disco → editor ---------- */
  const scan = useCallback(
    (projectId: string) =>
      serial(async () => {
        const link = links.current.get(projectId);
        const p = opts.current.project;
        if (!link || !p || p.id !== projectId || status_.current[projectId]?.state !== "linked") return;
        if (writeTimer.current) return; // há gravação agendada; varre depois dela
        let result;
        try {
          result = await scanChanges(link.handle, link.state, ignoreList());
        } catch (e) {
          fail(projectId, e);
          return;
        }
        const { changes, dirs } = result;
        const newDirs = dirs.filter((d) => !(p.folders ?? []).includes(d) && !link.dirs.includes(d));
        if (!changes.length && !newDirs.length) {
          await saveLink(link).catch(() => undefined); // datas atualizadas
          return;
        }
        const byName = new Map(p.files.map((f) => [f.name, f]));
        const conflicts: string[] = [];
        const restored: string[] = [];
        const apply: typeof changes = [];
        for (const c of changes) {
          const local = byName.get(c.path);
          const synced = link.state[c.path]?.h;
          const localHash = local ? await hashOf(local.content) : undefined;
          // edição local ainda não gravada neste arquivo?
          const dirty = c.type === "added" ? !!local && localHash !== c.file!.h : localHash !== synced;
          if (local && c.file && localHash === c.file.h) {
            link.state[c.path] = { m: c.file.m, s: c.file.s, h: c.file.h }; // os dois lados já iguais
            continue;
          }
          if (c.type === "removed" && dirty) {
            // apagado na pasta, mas com edição sua ainda não gravada: a sua versão volta para o disco
            delete link.state[c.path];
            restored.push(c.path);
            continue;
          }
          if (dirty) conflicts.push(c.path);
          apply.push(c);
        }
        if (restored.length) {
          opts.current.notify("warning", `${restored.join(", ")} foi apagado na pasta`, "Como havia edição sua ainda não gravada, o arquivo foi gravado de novo.");
          await saveLink(link).catch(() => undefined);
          const cur = opts.current.project;
          if (cur?.id === projectId) setTimeout(() => flushWrites(cur), 0);
        }
        if (!apply.length && !newDirs.length) {
          await saveLink(link).catch(() => undefined);
          return;
        }
        // guarda a versão do Poiesis antes de trazer o que mudou no disco
        const before = await opts.current.checkpoint(conflicts.length ? "conflict" : "pre-external", p, {
          label: conflicts.length ? `Conflito: sua versão de ${conflicts.length === 1 ? conflicts[0] : conflicts.length + " arquivos"}` : undefined,
        });
        for (const c of apply) {
          if (c.type === "removed") delete link.state[c.path];
          else link.state[c.path] = { m: c.file!.m, s: c.file!.s, h: c.file!.h };
        }
        link.dirs = [...new Set([...link.dirs, ...newDirs])];
        await saveLink(link);
        opts.current.updateProject((cur) => {
          if (cur.id !== projectId) return cur;
          let files = [...cur.files];
          for (const c of apply) {
            const i = files.findIndex((f) => f.name === c.path);
            if (c.type === "removed") {
              if (i >= 0) files.splice(i, 1);
            } else if (i >= 0) files[i] = { ...files[i], content: c.file!.content, kind: c.file!.kind, mime: c.file!.mime };
            else files.push({ id: uid(), name: c.path, content: c.file!.content, kind: c.file!.kind, mime: c.file!.mime });
          }
          const ids = new Set(files.map((f) => f.id));
          const openTabs = cur.openTabs.filter((x) => ids.has(x));
          files = files.sort((a, b) => a.name.localeCompare(b.name));
          return {
            ...cur,
            files,
            folders: [...new Set([...(cur.folders ?? []), ...newDirs])],
            openTabs,
            activeFile: cur.activeFile && ids.has(cur.activeFile) ? cur.activeFile : (openTabs[0] ?? null),
            entry: ids.has(cur.entry) ? cur.entry : (files.find((f) => f.kind === "html")?.id ?? ""),
          };
        });
        patch(projectId, { lastSync: Date.now() });
        if (conflicts.length && before) {
          opts.current.notify("warning", `Conflito com a pasta em ${conflicts.length === 1 ? conflicts[0] : conflicts.length + " arquivos"}`, "A versão do disco foi carregada; a sua ficou no histórico. Compare e escolha.");
          opts.current.onConflict(before, conflicts);
        } else {
          const n = apply.length;
          const names = apply.slice(0, 3).map((c) => c.path).join(", ");
          opts.current.notify("info", `${n} ${n === 1 ? "arquivo mudou" : "arquivos mudaram"} na pasta`, names + (n > 3 ? "…" : ""));
        }
      }),
    [serial, fail, patch] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const scanRef = useRef(scan);
  scanRef.current = scan;

  // varredura: ao focar, periódica (aba visível) e por observador
  const currentId = o.project?.id ?? null;
  const currentState = currentId ? status[currentId]?.state : undefined;
  useEffect(() => {
    if (!currentId || currentState !== "linked") return;
    const link = links.current.get(currentId);
    if (!link) return;
    const tick = () => document.visibilityState === "visible" && scan(currentId);
    const iv = setInterval(tick, POLL_MS);
    const onFocus = () => scan(currentId);
    window.addEventListener("focus", onFocus);
    const stop = observeFolder(link.handle, () => setTimeout(() => scan(currentId), 150));
    return () => {
      clearInterval(iv);
      window.removeEventListener("focus", onFocus);
      stop();
    };
  }, [currentId, currentState, scan]);

  /* ---------- conectar (sem gesto do usuário: só confere) ---------- */
  const check = useCallback(
    async (projectId: string, ask: boolean): Promise<boolean> => {
      const link = links.current.get(projectId);
      if (!link) return false;
      const perm = await ensurePermission(link.handle, ask);
      if (perm !== "granted") {
        patch(projectId, { state: "permission", error: perm === "denied" ? "O acesso à pasta foi negado." : undefined });
        return false;
      }
      if (!(await folderAlive(link.handle))) {
        patch(projectId, { state: "missing", error: "A pasta não foi encontrada (apagada, movida ou o disco foi removido)." });
        return false;
      }
      patch(projectId, { state: "linked", error: undefined });
      return true;
    },
    [patch]
  );

  useEffect(() => {
    if (!loaded || !currentId || !links.current.has(currentId)) return;
    if (status_.current[currentId]?.state === "linked") return;
    check(currentId, false).then((ok) => {
      if (ok) scan(currentId);
    });
  }, [loaded, currentId, check, scan]);

  /* ---------- ações ---------- */

  /** Escolhe uma pasta e lê tudo dela. Devolve o projeto novo (ainda não adicionado ao workspace). */
  const openFolder = useCallback(async (): Promise<Project | null> => {
    const handle = await pickDirectory();
    if (!handle) return null;
    if ((await ensurePermission(handle, true)) !== "granted") throw Object.assign(new Error("Sem permissão para a pasta."), { name: "NotAllowedError" });
    const r = await readFolder(handle, ignoreList());
    const now = Date.now();
    const html = r.files.find((f) => f.name === "index.html") ?? r.files.find((f) => f.kind === "html");
    const text = r.files.filter((f) => f.kind !== "asset");
    const p: Project = {
      id: uid(),
      name: handle.name,
      files: r.files,
      folders: r.dirs,
      entry: html?.id ?? "",
      openTabs: (html ? [html, ...text.filter((f) => f !== html)] : text).slice(0, 8).map((f) => f.id),
      activeFile: html?.id ?? text[0]?.id ?? null,
      createdAt: now,
      updatedAt: now,
    };
    const link: FolderLink = { projectId: p.id, handle, name: handle.name, linkedAt: now, state: r.state, dirs: r.dirs };
    await saveLink(link);
    links.current.set(p.id, link);
    patch(p.id, { state: "linked", name: handle.name, skipped: r.skipped, lastSync: now });
    return p;
  }, [patch]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Vincula um projeto existente a uma pasta. Se a pasta tiver arquivos, `decide` escolhe:
   * "write" grava o projeto na pasta (sobrescreve os de mesmo nome); "read" troca o
   * conteúdo do projeto pelo da pasta (com versão de segurança antes).
   */
  const linkProject = useCallback(
    async (p: Project, decide: (folder: string) => Promise<"write" | "read" | null>): Promise<boolean> => {
      const handle = await pickDirectory();
      if (!handle) return false;
      if ((await ensurePermission(handle, true)) !== "granted") throw Object.assign(new Error("Sem permissão para a pasta."), { name: "NotAllowedError" });
      const empty = await folderIsEmpty(handle, ignoreList());
      const mode = empty ? "write" : await decide(handle.name);
      if (!mode) return false;
      const now = Date.now();
      if (mode === "write") {
        const link: FolderLink = { projectId: p.id, handle, name: handle.name, linkedAt: now, state: {}, dirs: [] };
        // estado atual do disco para os arquivos que não vamos sobrescrever
        const r = await readFolder(handle, ignoreList());
        // arquivos de mesmo nome: data/tamanho atuais com hash vazio → o gravador sobrescreve sem tratar como conflito
        for (const f of r.files) link.state[f.name] = p.files.some((x) => x.name === f.name) ? { ...r.state[f.name], h: "" } : r.state[f.name];
        links.current.set(p.id, link);
        await saveLink(link);
        patch(p.id, { state: "linked", name: handle.name });
        await flushWrites(p);
        // arquivos que só existem na pasta entram no projeto
        const extra = r.files.filter((f) => !p.files.some((x) => x.name === f.name));
        if (extra.length) opts.current.updateProject((cur) => (cur.id === p.id ? { ...cur, files: [...cur.files, ...extra], folders: [...new Set([...(cur.folders ?? []), ...r.dirs])] } : cur));
      } else {
        await opts.current.checkpoint("pre-import", p, { label: `Antes de trazer a pasta ${handle.name}` });
        const ids = new Map(p.files.map((f) => [f.name, f.id]));
        const r = await readFolder(handle, ignoreList(), (path) => ids.get(path) ?? uid());
        const link: FolderLink = { projectId: p.id, handle, name: handle.name, linkedAt: now, state: r.state, dirs: r.dirs };
        links.current.set(p.id, link);
        await saveLink(link);
        patch(p.id, { state: "linked", name: handle.name, skipped: r.skipped, lastSync: now });
        opts.current.updateProject((cur) => {
          if (cur.id !== p.id) return cur;
          const fileIds = new Set(r.files.map((f) => f.id));
          const openTabs = cur.openTabs.filter((x) => fileIds.has(x));
          const html = r.files.find((f) => f.name === "index.html") ?? r.files.find((f) => f.kind === "html");
          return { ...cur, files: r.files, folders: r.dirs, openTabs, activeFile: openTabs[0] ?? html?.id ?? null, entry: fileIds.has(cur.entry) ? cur.entry : (html?.id ?? "") };
        });
      }
      return true;
    },
    [patch, flushWrites] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const unlink = useCallback(
    async (projectId: string) => {
      if (writeTimer.current && pending.current?.id === projectId) {
        clearTimeout(writeTimer.current);
        writeTimer.current = null;
        if (status_.current[projectId]?.state === "linked") await flushWrites(pending.current);
      }
      links.current.delete(projectId);
      await removeLink(projectId).catch(() => undefined);
      patch(projectId, null);
    },
    [patch, flushWrites]
  );

  /** Reconecta (precisa de clique do usuário para pedir permissão). */
  const reconnect = useCallback(
    async (projectId: string) => {
      const ok = await check(projectId, true);
      if (ok) await scan(projectId);
      return ok;
    },
    [check, scan]
  );

  /** Grava pendências agora e varre a pasta. */
  const syncNow = useCallback(
    async (projectId: string) => {
      if (writeTimer.current) {
        clearTimeout(writeTimer.current);
        writeTimer.current = null;
      }
      const p = opts.current.project;
      if (p && p.id === projectId) await flushWrites(p);
      await scan(projectId);
    },
    [flushWrites, scan]
  );

  /** Edição bloqueada: projeto vinculado sem acesso à pasta. */
  const isReadOnly = useCallback((projectId: string | undefined) => !!projectId && links.current.has(projectId) && status_.current[projectId]?.state !== "linked", []);

  const linkOf = useCallback((projectId: string | undefined) => (projectId ? (getLink(projectId) as Promise<FolderLink | null>) : Promise.resolve(null)), []);

  return { status, loaded, openFolder, linkProject, unlink, reconnect, syncNow, isReadOnly, linkOf, enabled: o.enabled };
}
