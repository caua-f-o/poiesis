// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/* Plugin do Vite que gera THIRD_PARTY_LICENSES.txt com a licença de cada pacote
 * que de fato entrou no bundle (exigência das licenças MIT/Apache/OFL ao redistribuir). */
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const LICENSE_FILE = /^(licen[sc]e|copying|notice)(\.(md|txt))?$/i;

/** Pacotes que vão no pacote final sem aparecer no grafo de módulos:
 * material-symbols é copiado para public/; os subpacotes do Emmet vêm embutidos no dist do `emmet`. */
const EXTRA = ["material-symbols", "@emmetio/abbreviation", "@emmetio/css-abbreviation", "@emmetio/scanner"];

/** Acha o pacote mesmo quando o pnpm não o expõe na raiz do node_modules. */
function locate(name: string): string | null {
  const top = path.resolve("node_modules", name);
  if (fs.existsSync(top)) return top;
  const store = path.resolve("node_modules/.pnpm");
  const prefix = name.replace("/", "+") + "@";
  const dir = fs.existsSync(store) ? fs.readdirSync(store).find((d) => d.startsWith(prefix)) : undefined;
  return dir ? path.join(store, dir, "node_modules", name) : null;
}

/** Arquivos com licença própria, que não vêm do node_modules. */
const MANUAL = `
================================================================================
Descrições de reserva do MDN (src/lib/mdn-data.json)
Licença: CC BY-SA 2.5 — https://creativecommons.org/licenses/by-sa/2.5/
Fonte: MDN Web Docs (https://developer.mozilla.org), por Mozilla Contributors,
extraídas via @vscode/web-custom-data (Microsoft, MIT). Este arquivo de dados
é redistribuído sob a mesma licença CC BY-SA 2.5, separado do código GPL.

================================================================================
Componentes de interface em src/components/ui/
Baseados em shadcn/ui — https://github.com/shadcn-ui/ui
Licença: MIT — Copyright (c) 2023 shadcn
(modificados e reestilizados para Material 3)

================================================================================
Fonte Lavishly Yours (src/assets/fonts/lavishly-yours.woff2, convertida do TTF original)
Copyright 2014-2021 The Lavishly Yours Project Authors (https://github.com/googlefonts/lavishly-yours)
Licença: SIL Open Font License 1.1 — texto completo abaixo.

${fs.readFileSync("src/assets/fonts/OFL-LavishlyYours.txt", "utf8").trim()}
`;

function pkgRoot(id: string): string | null {
  const clean = id.replace(/^\0/, "").split("?")[0];
  const i = clean.lastIndexOf("/node_modules/");
  if (i < 0) return null;
  const rest = clean.slice(i + "/node_modules/".length).split("/");
  const n = rest[0].startsWith("@") ? 2 : 1;
  return clean.slice(0, i + "/node_modules/".length) + rest.slice(0, n).join("/");
}

function describe(root: string): { key: string; text: string } | null {
  let pkg: { name?: string; version?: string; license?: string; author?: unknown; homepage?: string };
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  } catch {
    return null;
  }
  const files = fs.readdirSync(root).filter((f) => LICENSE_FILE.test(f));
  const body = files.map((f) => fs.readFileSync(path.join(root, f), "utf8").trim()).join("\n\n");
  const author = typeof pkg.author === "string" ? pkg.author : (pkg.author as { name?: string } | undefined)?.name;
  const head = [
    `${pkg.name}@${pkg.version}`,
    `Licença: ${pkg.license ?? "não declarada"}`,
    author ? `Autor: ${author}` : "",
    pkg.homepage ? `Site: ${pkg.homepage}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return { key: `${pkg.name}@${pkg.version}`, text: `${head}\n\n${body || "(o pacote não inclui arquivo de licença)"}` };
}

export function thirdPartyLicenses(): Plugin {
  return {
    name: "poiesis-third-party-licenses",
    apply: "build",
    generateBundle() {
      const roots = new Set<string>();
      for (const id of this.getModuleIds()) {
        const r = pkgRoot(id);
        if (r) roots.add(r);
      }
      for (const name of EXTRA) {
        const r = locate(name);
        if (r) roots.add(r);
        else this.warn(`licença não encontrada para ${name}`);
      }
      const seen = new Map<string, string>();
      for (const r of roots) {
        const d = describe(fs.realpathSync(r));
        if (d && !seen.has(d.key)) seen.set(d.key, d.text);
      }
      const entries = [...seen.entries()].sort(([a], [b]) => a.localeCompare(b));
      const sep = "\n\n" + "=".repeat(80) + "\n";
      const source =
        "Poiesis — licenças de terceiros\n" +
        "O Poiesis é distribuído sob a GNU GPL v3 (somente a versão 3; veja LICENSE).\n" +
        `Este pacote inclui os componentes abaixo (${entries.length} pacotes), cada um sob sua própria licença.\n` +
        MANUAL +
        sep +
        entries.map(([, t]) => t).join(sep) +
        "\n";
      this.emitFile({ type: "asset", fileName: "THIRD_PARTY_LICENSES.txt", source });
      this.emitFile({ type: "asset", fileName: "LICENSE", source: fs.readFileSync("LICENSE", "utf8") });
    },
  };
}
