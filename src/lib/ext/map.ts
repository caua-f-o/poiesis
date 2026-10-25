// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/* Mapa da extensão (manifesto → pontos de entrada → arquivos que cada um carrega)
 * e a lista do que vai no ZIP. */
import type { PFile, Project } from "../types";
import { dirName, resolvePath } from "../files";
import { MOCKS_FILE, parseMocks } from "../net";
import { MANIFEST, entriesOf, htmlRefs, isGlob, jsRefs, type Json, type Role } from "./manifest";

export interface MapNode {
  label: string;
  file?: string;
  kind: Role | "manifest" | "script" | "style" | "asset" | "module";
  missing?: boolean;
  external?: boolean;
  children: MapNode[];
}

const ROLE_ORDER: Role[] = ["popup", "sidepanel", "options", "background", "content", "content-css", "override", "devtools", "war", "sandbox", "locale", "icon"];

export function extensionMap(files: PFile[], m: Json): { root: MapNode; reached: Set<string>; orphans: string[] } {
  const byName = new Map(files.map((f) => [f.name, f]));
  const reached = new Set<string>([MANIFEST]);

  const visit = (path: string, kind: MapNode["kind"], label: string, depth: number, seen: Set<string>): MapNode => {
    const f = byName.get(path);
    const node: MapNode = { label, file: path, kind, missing: !f, children: [] };
    if (!f) return node;
    reached.add(path);
    if (seen.has(path) || depth > 6) return node;
    const next = new Set(seen).add(path);
    const dir = dirName(path);
    if (f.kind === "html") {
      for (const r of htmlRefs(f.content)) {
        if (/^(https?:)?\/\//i.test(r.ref)) {
          node.children.push({ label: r.ref, kind: r.kind === "script" ? "script" : r.kind === "style" ? "style" : "asset", external: true, children: [] });
          continue;
        }
        const p = resolvePath(r.ref, dir);
        if (!p || /^data:/.test(r.ref)) continue;
        node.children.push(visit(p, r.kind === "script" ? "script" : r.kind === "style" ? "style" : "asset", p, depth + 1, next));
      }
    } else if (f.kind === "js") {
      for (const r of jsRefs(f.content)) {
        if (/^(https?:)?\/\//i.test(r.ref)) {
          node.children.push({ label: r.ref, kind: "module", external: true, children: [] });
          continue;
        }
        const p = resolvePath(r.ref, r.how === "importScripts" ? "" : dir);
        if (p) node.children.push(visit(p, "module", p, depth + 1, next));
      }
    }
    return node;
  };

  const root: MapNode = { label: MANIFEST, file: MANIFEST, kind: "manifest", children: [] };
  const entries = entriesOf(m).sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
  for (const e of entries) {
    if (e.role === "war" && isGlob(e.path)) {
      const re = new RegExp("^" + e.path.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
      const hits = files.filter((f) => re.test(f.name));
      hits.forEach((f) => reached.add(f.name));
      root.children.push({ label: `${e.label}: ${e.path}`, kind: "war", children: hits.map((f) => ({ label: f.name, file: f.name, kind: "asset", children: [] })) });
      continue;
    }
    const n = visit(e.path, e.role, `${e.label}: ${e.path}`, 0, new Set());
    root.children.push(n);
  }
  // _locales inteiro vai junto quando há default_locale
  if (m?.default_locale) for (const f of files) if (f.name.startsWith("_locales/")) reached.add(f.name);
  const orphans = files.map((f) => f.name).filter((n) => !reached.has(n));
  return { root, reached, orphans };
}

export const safeZipName = (n: string) => !!n && !/(^|\/)\.\.?(\/|$)|^\/|\\|:|[\u0000-\u001f]/.test(n);

/** Arquivos que vão no ZIP da extensão. Ficam fora só os do Poiesis: poiesis.mocks.json
 *  e as fixtures dele que a extensão não usa. */
export function extensionZipFiles(project: Project, m: Json): { include: PFile[]; excluded: string[] } {
  const { reached } = extensionMap(project.files, m);
  const mocks = project.files.find((f) => f.name === MOCKS_FILE);
  const fixtures = new Set<string>();
  if (mocks) for (const r of parseMocks(mocks.content).config.mocks) if (r.bodyFile) fixtures.add(r.bodyFile.replace(/^\.?\//, ""));
  const excluded: string[] = [];
  const include = project.files.filter((f) => {
    // nomes que escapariam da pasta ao descompactar (../, /, \) nunca entram
    if (f.name === MOCKS_FILE || (fixtures.has(f.name) && !reached.has(f.name)) || !safeZipName(f.name)) {
      excluded.push(f.name);
      return false;
    }
    return true;
  });
  return { include, excluded };
}
