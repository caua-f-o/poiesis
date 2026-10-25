// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/* Banco local do Poiesis (IndexedDB). Tudo fica no navegador; nada sai daqui.
 *
 * Stores:
 *  - meta       chave → valor (estado do workspace sem os projetos, flags de migração)
 *  - projects   um registro por projeto (keyPath "id")
 *  - blobs      conteúdo de arquivos do histórico, endereçado por hash (keyPath "h")
 *  - revisions  versões do histórico (keyPath "id"; índice "project")
 */

const NAME = "poiesis";
const VERSION = 1;

export type StoreName = "meta" | "projects" | "blobs" | "revisions";

let opening: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // migrações de esquema: cada bloco cria o que a versão anterior não tinha
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs", { keyPath: "h" });
      if (!db.objectStoreNames.contains("revisions")) {
        const s = db.createObjectStore("revisions", { keyPath: "id" });
        s.createIndex("project", "projectId", { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // outra aba pediu upgrade: fecha para não travar e reabre na próxima chamada
      db.onversionchange = () => {
        db.close();
        opening = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      opening = null;
      reject(req.error);
    };
    req.onblocked = () => console.warn("[Poiesis] banco bloqueado por outra aba aberta");
  });
  return opening;
}

export const reqP = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

/** Executa `fn` numa transação e só resolve quando ela foi efetivada (tudo ou nada). */
export async function tx<T>(stores: StoreName[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => T | Promise<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(stores, mode, { durability: "strict" } as IDBTransactionOptions);
    let result: T;
    let failed: unknown = null;
    t.oncomplete = () => (failed ? reject(failed) : resolve(result));
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? failed ?? new Error("transação abortada"));
    Promise.resolve()
      .then(() => fn(t))
      .then((r) => (result = r))
      .catch((e) => {
        failed = e;
        try {
          t.abort();
        } catch {
          /* já finalizada */
        }
      });
  });
}

/** Mensagem amigável para erros de banco (principalmente falta de espaço). */
export function dbErrorMessage(e: unknown): string {
  const name = (e as DOMException)?.name;
  if (name === "QuotaExceededError") return "Sem espaço no navegador para salvar. Exporte e apague versões antigas do histórico ou projetos que não usa.";
  if (name === "InvalidStateError") return "O banco local foi fechado (outra aba atualizou o Poiesis). Recarregue a página.";
  return (e as Error)?.message || String(e);
}

export interface StorageUsage {
  usage: number;
  quota: number;
}

export async function storageUsage(): Promise<StorageUsage | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null;
  } catch {
    return null;
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0).replace(".", ",")} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
  return `${(n / 1024 ** 3).toFixed(2).replace(".", ",")} GB`;
}
