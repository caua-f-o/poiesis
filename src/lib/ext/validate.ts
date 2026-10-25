// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/* Extension Studio: validação de um projeto de extensão MV3 antes de exportar.
 * Tudo é estático (nada é executado): manifesto, referências, CSP das páginas,
 * APIs chrome.* usadas × permissões declaradas. */
import type { PFile } from "../types";
import { baseName, dirName, resolvePath } from "../files";
import { MOCKS_FILE } from "../net";
import { MANIFEST, PAGE_ROLES, editManifest, entriesOf, getAt, htmlRefs, isGlob, jsRefs, jsonRange, manifestFile, parseManifest, pngSize, setAt, type EntryRef, type JPath, type Json } from "./manifest";
import { safeZipName } from "./map";
import { API_PERMISSION, BROAD_HOSTS, PERM, isExtensionId, matchPatternError } from "./permissions";

export type Sev = "error" | "warning" | "info";

export type ExtFix =
  | { label: string; kind: "set"; path: JPath; value: Json }
  | { label: string; kind: "remove"; path: JPath }
  | { label: string; kind: "rename-key"; from: string; to: string }
  | { label: string; kind: "add-perm"; perm: string }
  | { label: string; kind: "move-host"; value: string }
  | { label: string; kind: "mv2-background" }
  | { label: string; kind: "war-v3" }
  | { label: string; kind: "csp-v3" }
  | { label: string; kind: "create"; file: string; content: string }
  | { label: string; kind: "extract-inline"; file: string; at: number };

export interface ExtProblem {
  sev: Sev;
  msg: string;
  /** arquivo onde está o problema */
  file: string;
  /** caminho no manifesto (só para problemas do manifest.json) */
  jpath?: JPath;
  /** posição no arquivo */
  from: number;
  to: number;
  fix?: ExtFix;
}

export interface ExtReport {
  manifest: Json | null;
  parseError: string | null;
  entries: EntryRef[];
  problems: ExtProblem[];
  /** APIs chrome.* usadas → arquivos */
  apis: Map<string, string[]>;
}

const KNOWN_KEYS = new Set(
  "manifest_version name version description icons action background content_scripts content_security_policy permissions optional_permissions host_permissions optional_host_permissions web_accessible_resources options_page options_ui side_panel default_locale short_name version_name author homepage_url minimum_chrome_version key update_url commands chrome_url_overrides devtools_page externally_connectable incognito oauth2 omnibox declarative_net_request storage sandbox file_browser_handlers file_system_provider_capabilities tts_engine offline_enabled requirements import export cross_origin_embedder_policy cross_origin_opener_policy event_rules automation chrome_settings_overrides input_components trial_tokens $schema".split(" ")
);
const MV2_KEYS: Record<string, string> = { browser_action: "action", page_action: "action" };

function lev(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function nearest(word: string, list: Iterable<string>): string | null {
  let best: string | null = null;
  let bd = Math.max(2, Math.floor(word.length / 3)) + 1;
  for (const c of list) {
    const d = lev(word.toLowerCase(), c.toLowerCase());
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

/** Troca comentários por espaços (mantém as posições) para não acusar código comentado. */
export function blankComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\/|(^|[^:\\])\/\/[^\n]*/g, (m, pre: string | undefined) => (pre ?? "") + m.slice((pre ?? "").length).replace(/[^\n]/g, " "));
}

const VERSION_RE = /^(0|[1-9]\d{0,4})(\.(0|[1-9]\d{0,4})){0,3}$/;
const NON_JS_TYPES = /^(application\/(ld\+)?json|text\/(template|x-[\w-]+|html|plain)|importmap-x)$/i;

export function validateExtension(files: PFile[]): ExtReport {
  const problems: ExtProblem[] = [];
  const apis = new Map<string, string[]>();
  const mf = manifestFile(files);
  const byName = new Map(files.map((f) => [f.name, f]));
  const byLower = new Map(files.map((f) => [f.name.toLowerCase(), f]));

  if (!mf) {
    const nested = files.find((f) => baseName(f.name) === MANIFEST);
    problems.push({
      sev: "error",
      msg: nested ? `O manifest.json está em “${dirName(nested.name)}/”. Ele precisa ficar na raiz do projeto (a raiz do ZIP).` : "Falta o manifest.json na raiz do projeto.",
      file: nested?.name ?? MANIFEST,
      from: 0,
      to: 0,
    });
    return { manifest: null, parseError: null, entries: [], problems, apis };
  }

  const src = mf.content;
  const { data: m, error } = parseManifest(src);
  if (!m) {
    problems.push({ sev: "error", msg: error ?? "Manifesto inválido.", file: MANIFEST, from: 0, to: Math.min(1, src.length) });
    return { manifest: null, parseError: error, entries: [], problems, apis };
  }

  const at = (jpath: JPath, key = false) => jsonRange(src, jpath, key);
  const P = (sev: Sev, msg: string, jpath: JPath, fix?: ExtFix, key = false) => problems.push({ sev, msg, file: MANIFEST, jpath, ...at(jpath, key), fix });
  const FP = (sev: Sev, msg: string, file: string, from: number, to: number, fix?: ExtFix) => problems.push({ sev, msg, file, from, to, fix });

  /* ---------- campos básicos ---------- */
  if (m.manifest_version !== 3)
    P(
      "error",
      m.manifest_version === 2 ? "Manifest V2 não roda mais no Chrome. Use \"manifest_version\": 3 (e revise background, action e CSP)." : "\"manifest_version\" precisa ser 3.",
      ["manifest_version"],
      { label: "Usar manifest_version 3", kind: "set", path: ["manifest_version"], value: 3 }
    );
  const i18nName = typeof m.name === "string" && /^__MSG_\w+__$/.test(m.name);
  if (typeof m.name !== "string" || !m.name.trim()) P("error", "Falta o nome (\"name\").", ["name"], { label: "Definir um nome", kind: "set", path: ["name"], value: "Minha extensão" });
  else if (!i18nName && m.name.length > 75) P("error", `O nome tem ${m.name.length} caracteres; o limite é 75.`, ["name"]);
  if (typeof m.short_name === "string" && !/^__MSG_/.test(m.short_name) && m.short_name.length > 12) P("warning", "\"short_name\" passa de 12 caracteres e pode aparecer cortado.", ["short_name"]);
  if (typeof m.version !== "string" || !VERSION_RE.test(m.version))
    P("error", "\"version\" precisa ter de 1 a 4 números separados por ponto (0 a 65535, sem zeros à esquerda), como \"1.0.0\".", ["version"], { label: "Usar 1.0.0", kind: "set", path: ["version"], value: "1.0.0" });
  else if (m.version.split(".").some((n: string) => +n > 65535)) P("error", "Cada número de \"version\" vai no máximo até 65535.", ["version"]);
  if (typeof m.description === "string" && !/^__MSG_/.test(m.description) && m.description.length > 132) P("warning", `A descrição tem ${m.description.length} caracteres; a Chrome Web Store aceita até 132.`, ["description"]);
  if (m.description == null) P("info", "Sem \"description\": ela aparece em chrome://extensions e na loja.", ["name"], undefined, true);

  /* ---------- chaves desconhecidas e do MV2 ---------- */
  for (const k of Object.keys(m)) {
    if (MV2_KEYS[k]) P("error", `“${k}” é do Manifest V2. No V3 o botão da extensão é configurado em "action".`, [k], m.action ? undefined : { label: `Renomear para "action"`, kind: "rename-key", from: k, to: "action" }, true);
    else if (!KNOWN_KEYS.has(k)) {
      const s = nearest(k, KNOWN_KEYS);
      P("warning", `O Chrome não conhece a chave “${k}” e vai ignorá-la (com aviso em chrome://extensions).${s ? ` Você quis dizer “${s}”?` : ""}`, [k], s && !(s in m) ? { label: `Renomear para "${s}"`, kind: "rename-key", from: k, to: s } : undefined, true);
    }
  }

  /* ---------- background ---------- */
  const bg = m.background;
  if (bg && typeof bg === "object") {
    if (bg.scripts || bg.page || "persistent" in bg)
      P("error", "No MV3 o fundo é um service worker: use \"background\": { \"service_worker\": \"background.js\" } (sem scripts, page ou persistent).", ["background"], bg.service_worker ? undefined : { label: "Converter para service_worker", kind: "mv2-background" }, true);
    if (bg.service_worker != null && (typeof bg.service_worker !== "string" || !/\.m?js$/i.test(bg.service_worker))) P("error", "\"service_worker\" precisa ser um único arquivo .js.", ["background", "service_worker"]);
    if (bg.type != null && bg.type !== "module") P("error", "\"background.type\" só aceita \"module\".", ["background", "type"], { label: "Remover \"type\"", kind: "remove", path: ["background", "type"] });
  }

  /* ---------- CSP ---------- */
  const csp = m.content_security_policy;
  if (typeof csp === "string") P("error", "No MV3 \"content_security_policy\" é um objeto: { \"extension_pages\": \"…\" }.", ["content_security_policy"], { label: "Converter para o formato do MV3", kind: "csp-v3" });
  else if (csp && typeof csp === "object" && typeof csp.extension_pages === "string") {
    const ep: string = csp.extension_pages;
    const script = /script-src([^;]*)/.exec(ep)?.[1] ?? "";
    if (/'unsafe-eval'|'unsafe-inline'/.test(script) || /https?:|\*/.test(script))
      P("error", "A CSP das páginas da extensão não pode liberar 'unsafe-eval', 'unsafe-inline' nem scripts de outros sites no MV3. O Chrome recusa carregar a extensão.", ["content_security_policy", "extension_pages"]);
  }

  /* ---------- permissões ---------- */
  const perms: string[] = Array.isArray(m.permissions) ? m.permissions.filter((x: unknown) => typeof x === "string") : [];
  const optPerms: string[] = Array.isArray(m.optional_permissions) ? m.optional_permissions.filter((x: unknown) => typeof x === "string") : [];
  const declared = new Set([...perms, ...optPerms]);
  for (const [key, list] of [["permissions", perms], ["optional_permissions", optPerms]] as const) {
    list.forEach((p, i) => {
      if (p.includes("://") || p === "<all_urls>") {
        if (key === "permissions") P("error", `“${p}” é um site, não uma permissão. No MV3 os sites vão em "host_permissions".`, [key, i], { label: "Mover para host_permissions", kind: "move-host", value: p });
        return;
      }
      if (p === "webRequestBlocking") return P("error", "\"webRequestBlocking\" no MV3 só funciona em extensões instaladas por política empresarial. Use declarativeNetRequest.", [key, i]);
      if (!PERM.has(p) && !/^(enterprise|system)\.|^(certificateProvider|documentScan|fileBrowserHandler|fileSystemProvider|gcm|loginState|platformKeys|printing|printingMetrics|processes|vpnProvider|wallpaper|webAuthenticationProxy|dns|downloads\.(open|ui)|accessibilityFeatures\.(read|modify)|audio|chrome:\/\/favicon\/)/.test(p)) {
        const s = nearest(p, PERM.keys());
        P("warning", `Permissão desconhecida: “${p}”.${s ? ` Você quis dizer “${s}”?` : ""}`, [key, i], s ? { label: `Trocar por "${s}"`, kind: "set", path: [key, i], value: s } : undefined);
      }
    });
  }

  /* ---------- padrões de URL ---------- */
  const hosts: string[] = Array.isArray(m.host_permissions) ? m.host_permissions : [];
  hosts.forEach((h, i) => {
    if (typeof h !== "string") return P("error", "Cada item de host_permissions é um texto (padrão de URL).", ["host_permissions", i]);
    const err = matchPatternError(h);
    if (err) return P("error", err, ["host_permissions", i]);
    if (BROAD_HOSTS.has(h) || /^\*:\/\/\*\//.test(h))
      P("warning", `“${h}” dá acesso a todos os sites: na instalação o Chrome avisa "Ler e alterar todos os seus dados em todos os sites", e a revisão na loja demora mais. Se só precisa da aba atual depois de um clique, use "activeTab".`, ["host_permissions", i]);
  });
  (Array.isArray(m.optional_host_permissions) ? m.optional_host_permissions : []).forEach((h: unknown, i: number) => {
    const err = typeof h === "string" ? matchPatternError(h) : "Precisa ser texto.";
    if (err) P("error", err, ["optional_host_permissions", i]);
  });

  /* ---------- content scripts ---------- */
  if (m.content_scripts != null && !Array.isArray(m.content_scripts)) P("error", "\"content_scripts\" é uma lista de objetos.", ["content_scripts"]);
  (Array.isArray(m.content_scripts) ? m.content_scripts : []).forEach((cs: Json, i: number) => {
    const base: JPath = ["content_scripts", i];
    if (!cs || typeof cs !== "object") return P("error", "Cada content script é um objeto com matches e js/css.", base);
    if (!Array.isArray(cs.matches) || !cs.matches.length) P("error", "Content script sem \"matches\" (em quais páginas ele roda).", base, { label: "Rodar em https://exemplo.com/*", kind: "set", path: [...base, "matches"], value: ["https://exemplo.com/*"] });
    else
      cs.matches.forEach((h: unknown, j: number) => {
        const err = typeof h === "string" ? matchPatternError(h) : "Precisa ser texto.";
        if (err) P("error", err, [...base, "matches", j]);
        else if (BROAD_HOSTS.has(h as string)) P("warning", `Um content script em “${h}” roda em todos os sites e gera o aviso "Ler e alterar todos os seus dados em todos os sites".`, [...base, "matches", j]);
      });
    if (!(Array.isArray(cs.js) && cs.js.length) && !(Array.isArray(cs.css) && cs.css.length)) P("error", "Content script sem \"js\" nem \"css\".", base);
    if (cs.run_at != null && !["document_start", "document_end", "document_idle"].includes(cs.run_at)) P("error", "\"run_at\" aceita document_start, document_end ou document_idle.", [...base, "run_at"]);
    if (cs.world != null && !["ISOLATED", "MAIN"].includes(cs.world)) P("error", "\"world\" aceita ISOLATED ou MAIN.", [...base, "world"]);
  });

  /* ---------- web_accessible_resources ---------- */
  const war = m.web_accessible_resources;
  if (Array.isArray(war)) {
    if (war.some((w) => typeof w === "string")) P("error", "No MV3 cada item de \"web_accessible_resources\" é um objeto { \"resources\": […], \"matches\": […] }.", ["web_accessible_resources"], { label: "Converter para o formato do MV3", kind: "war-v3" });
    else
      war.forEach((w: Json, i: number) => {
        if (!w || typeof w !== "object") return;
        if (!Array.isArray(w.resources)) P("error", "Falta \"resources\".", ["web_accessible_resources", i]);
        if (!Array.isArray(w.matches) && !Array.isArray(w.extension_ids)) P("error", "Diga quem pode acessar: \"matches\" (sites) ou \"extension_ids\".", ["web_accessible_resources", i]);
        (Array.isArray(w.matches) ? w.matches : []).forEach((h: unknown, j: number) => {
          const err = typeof h === "string" ? matchPatternError(h) : "Precisa ser texto.";
          if (err) P("error", err, ["web_accessible_resources", i, "matches", j]);
        });
      });
  }

  /* ---------- externally_connectable ---------- */
  const ec = m.externally_connectable;
  if (ec && typeof ec === "object") {
    (Array.isArray(ec.ids) ? ec.ids : []).forEach((id: unknown, i: number) => {
      if (id === "*") P("warning", "\"ids\": [\"*\"] deixa qualquer extensão mandar mensagens para esta. Prefira listar os IDs confiáveis.", ["externally_connectable", "ids", i]);
      else if (typeof id !== "string" || !isExtensionId(id)) P("error", `“${String(id)}” não é um ID de extensão (32 letras de a a p, como aparece em chrome://extensions).`, ["externally_connectable", "ids", i]);
    });
    if (Array.isArray(ec.ids) && !ec.ids.length && !(Array.isArray(ec.matches) && ec.matches.length))
      P("info", "\"externally_connectable\" está vazio: nenhuma outra extensão nem site consegue mandar mensagens para esta. Adicione o ID da extensão complementar em \"ids\".", ["externally_connectable"], undefined, true);
    (Array.isArray(ec.matches) ? ec.matches : []).forEach((h: unknown, i: number) => {
      const err = typeof h === "string" ? matchPatternError(h) : "Precisa ser texto.";
      if (err) P("error", err, ["externally_connectable", "matches", i]);
      else if (BROAD_HOSTS.has(h as string) || /^\*:\/\/\*\.?[^./]*\//.test(h as string)) P("error", "Em externally_connectable.matches o Chrome exige um domínio de segundo nível (ex.: https://*.exemplo.com/*), nunca todos os sites.", ["externally_connectable", "matches", i]);
    });
  }

  /* ---------- opções e painel lateral ---------- */
  if (m.options_page && m.options_ui) P("warning", "Use só um: \"options_page\" ou \"options_ui\".", ["options_page"], { label: "Remover options_page", kind: "remove", path: ["options_page"] }, true);
  if (m.side_panel && !declared.has("sidePanel")) P("error", "\"side_panel\" exige a permissão \"sidePanel\".", ["side_panel"], { label: "Adicionar a permissão sidePanel", kind: "add-perm", perm: "sidePanel" }, true);

  /* ---------- arquivos referenciados ---------- */
  const entries = entriesOf(m);
  const exists = (p: string) => byName.has(p) || (p.endsWith("/") && files.some((f) => f.name.startsWith(p)));
  for (const e of entries) {
    if (e.role === "war" && isGlob(e.path)) {
      const re = new RegExp("^" + e.path.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
      if (!files.some((f) => re.test(f.name))) P("warning", `Nenhum arquivo combina com “${e.path}”.`, e.jpath);
      continue;
    }
    if (exists(e.path)) {
      const f = byName.get(e.path);
      if (f && e.role === "icon") {
        if (/\.svg$/i.test(f.name)) P("error", `“${e.path}”: o Chrome não aceita SVG como ícone de extensão. Use PNG (o gerador de ícones faz isso).`, e.jpath);
        else if (!/\.png$/i.test(f.name)) P("warning", `“${e.path}”: prefira PNG para os ícones.`, e.jpath);
        else {
          const size = pngSize(f.content);
          const want = Number(e.jpath[e.jpath.length - 1]);
          if (size && want && (size.w !== want || size.h !== want)) P("warning", `“${e.path}” tem ${size.w}×${size.h}, mas está declarado como ${want}×${want}.`, e.jpath);
        }
      }
      if (f && ["popup", "options", "sidepanel", "devtools", "override"].includes(e.role) && f.kind !== "html") P("error", `“${e.path}” precisa ser uma página .html.`, e.jpath);
      continue;
    }
    const ci = byLower.get(e.path.toLowerCase());
    if (ci) {
      P("warning", `“${e.path}” só existe como “${ci.name}”. Maiúsculas e minúsculas contam no Linux e no ChromeOS.`, e.jpath, e.role === "locale" ? undefined : { label: `Usar ${ci.name}`, kind: "set", path: e.jpath, value: ci.name });
      continue;
    }
    if (e.role === "locale") {
      P("error", `Com "default_locale": "${m.default_locale}" precisa existir _locales/${m.default_locale}/messages.json.`, ["default_locale"], {
        label: "Criar o arquivo de traduções",
        kind: "create",
        file: e.path,
        content: JSON.stringify({ nome: { message: typeof m.name === "string" && !/^__MSG_/.test(m.name) ? m.name : "Minha extensão" } }, null, 2) + "\n",
      });
      continue;
    }
    P("error", `${e.label}: o arquivo “${e.path}” não existe no projeto.`, e.jpath, starterFor(e));
  }
  if (!m.default_locale && files.some((f) => f.name.startsWith("_locales/"))) P("error", "Existe a pasta _locales, então o Chrome exige \"default_locale\" (ex.: \"pt_BR\").", ["name"], { label: "Definir default_locale", kind: "set", path: ["default_locale"], value: files.find((f) => f.name.startsWith("_locales/"))!.name.split("/")[1] }, true);
  if (/__MSG_\w+__/.test(src) && !m.default_locale) P("error", "O manifesto usa __MSG_…__, mas não tem \"default_locale\".", ["name"]);
  if (!m.icons) P("warning", "Sem \"icons\": o Chrome mostra uma letra cinza e a Web Store exige um ícone de 128×128. Use o gerador de ícones.", ["name"], undefined, true);
  else if (typeof m.icons === "object" && !m.icons["128"]) P("warning", "Falta o ícone de 128×128 (a Web Store exige).", ["icons"], undefined, true);

  /* ---------- nomes que o Chrome recusa ---------- */
  for (const f of files) {
    const bad = f.name.split("/").find((seg, i) => seg.startsWith("_") && !(i === 0 && seg === "_locales"));
    if (bad) FP("error", `“${f.name}”: o Chrome não carrega extensões com arquivos ou pastas que começam com "_" (reservado). Renomeie “${bad}”.`, f.name, 0, 0);
  }
  for (const f of files) if (!safeZipName(f.name)) FP("error", `Nome de arquivo inválido para o ZIP: “${f.name}”. Ele fica fora da exportação.`, f.name, 0, 0);
  if (byName.has(MOCKS_FILE)) FP("info", `${MOCKS_FILE} é do Poiesis (mocks do preview) e fica fora do ZIP da extensão.`, MOCKS_FILE, 0, 0);

  /* ---------- páginas da extensão: CSP do MV3 ---------- */
  const pagePaths = new Set(entries.filter((e) => PAGE_ROLES.includes(e.role)).map((e) => e.path));
  for (const f of files) {
    if (f.kind !== "html") continue;
    const isEntry = pagePaths.has(f.name);
    // comentários HTML não contam (mantém as posições)
    const html = f.content.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, " "));
    const sev: Sev = isEntry ? "error" : "warning";
    const why = isEntry ? "" : " (se esta página for aberta pela extensão)";
    for (const s of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      const attrs = s[1];
      const type = /\stype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1] ?? "";
      const src = /\ssrc\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
      if (src) {
        if (/^(https?:)?\/\//i.test(src)) FP(sev, `Scripts de outros sites não rodam em páginas de extensão no MV3${why}. Baixe a biblioteca para dentro do projeto.`, f.name, s.index!, s.index! + s[0].indexOf(">") + 1);
        else {
          const p = resolvePath(src, dirName(f.name));
          if (p && !byName.has(p)) FP("error", `“${src}” não existe no projeto.`, f.name, s.index!, s.index! + s[0].indexOf(">") + 1, { label: `Criar ${p}`, kind: "create", file: p, content: "// " + p + "\n" });
        }
        continue;
      }
      if (!s[2].trim() || NON_JS_TYPES.test(type) || (type && !/module|javascript|ecmascript|importmap/i.test(type))) continue;
      FP(sev, `Script inline${why}: a CSP do MV3 bloqueia. Mova o código para um arquivo .js e use <script src="…">.`, f.name, s.index!, s.index! + s[0].indexOf(">") + 1, { label: "Mover para um arquivo .js", kind: "extract-inline", file: f.name, at: s.index! });
    }
    for (const t of html.matchAll(/<[a-zA-Z][^>]*>/g)) {
      for (const a of t[0].matchAll(/\s(on[a-z]+)\s*=\s*["']/gi))
        FP(sev, `Atributo ${a[1]}="…"${why}: a CSP do MV3 bloqueia código em atributos. Use addEventListener num arquivo .js.`, f.name, t.index! + a.index! + 1, t.index! + a.index! + 1 + a[1].length);
      const js = /\s(?:href|src|action)\s*=\s*["']\s*javascript:/i.exec(t[0]);
      if (js) FP(sev, `Link javascript:${why} é bloqueado pela CSP do MV3.`, f.name, t.index! + js.index!, t.index! + js.index! + js[0].length);
    }
    for (const r of htmlRefs(html)) {
      if (r.kind !== "style" || /^(https?:)?\/\/|^data:/i.test(r.ref)) continue;
      const p = resolvePath(r.ref, dirName(f.name));
      if (p && !byName.has(p)) FP("error", `“${r.ref}” não existe no projeto.`, f.name, r.at, r.at + 5);
    }
  }

  /* ---------- JS: APIs, eval, imports ---------- */
  const role = new Map<string, EntryRef["role"]>();
  for (const e of entries) if (!role.has(e.path)) role.set(e.path, e.role);
  const swType = bg && typeof bg === "object" ? bg.type : undefined;
  for (const f of files) {
    if (f.kind !== "js" || f.name.startsWith("node_modules/")) continue;
    const code = blankComments(f.content);
    const r = role.get(f.name);
    for (const a of code.matchAll(/\bchrome\s*\.\s*([A-Za-z]+)(?:\s*\.\s*([A-Za-z]+))?/g)) {
      let ns = a[1];
      if (ns === "system" && a[2]) ns = "system." + a[2];
      const list = apis.get(ns) ?? [];
      if (!list.includes(f.name)) apis.set(ns, [...list, f.name]);
      const at0 = a.index!;
      const len = a[0].length;
      if (ns === "browserAction" || ns === "pageAction") FP("error", `chrome.${ns} é do MV2. Use chrome.action.`, f.name, at0, at0 + len);
      else if (ns === "extension" && a[2] === "getBackgroundPage") FP("error", "No MV3 não existe página de fundo (getBackgroundPage). Converse com o service worker por mensagens.", f.name, at0, at0 + len);
      else if (ns === "runtime" && a[2] === "getBackgroundPage") FP("error", "No MV3 não existe página de fundo. Use chrome.runtime.sendMessage.", f.name, at0, at0 + len);
      else if (ns === "tabs" && (a[2] === "executeScript" || a[2] === "insertCSS")) FP("error", `chrome.tabs.${a[2]} é do MV2. Use chrome.scripting.${a[2] === "insertCSS" ? "insertCSS" : "executeScript"} (permissão "scripting").`, f.name, at0, at0 + len);
      else if (r === "content" && ["tabs", "windows", "action", "sidePanel", "scripting", "alarms", "contextMenus", "downloads", "history", "bookmarks"].includes(ns))
        FP("warning", `chrome.${ns} não existe em content scripts. Mande uma mensagem (chrome.runtime.sendMessage) e faça isso no service worker.`, f.name, at0, at0 + len);
    }
    if (/\b(eval\s*\(|new\s+Function\s*\(|set(?:Timeout|Interval)\s*\(\s*["'`])/.test(code)) {
      const e = /\b(eval\s*\(|new\s+Function\s*\(|set(?:Timeout|Interval)\s*\(\s*["'`])/.exec(code)!;
      FP("warning", "eval, new Function e setTimeout com texto são bloqueados pela CSP das páginas de extensão no MV3.", f.name, e.index, e.index + e[0].length);
    }
    const refs = jsRefs(code);
    for (const ref of refs) {
      if (/^(https?:)?\/\//i.test(ref.ref)) FP("error", `Importar código de outro site (“${ref.ref}”) não é permitido no MV3. Baixe o arquivo para o projeto.`, f.name, ref.at, ref.at + 6);
    }
    if (r === "background") {
      const staticImport = refs.find((x) => x.how === "import");
      if (staticImport && swType !== "module")
        FP("error", "O service worker usa import, então precisa de \"type\": \"module\" em \"background\".", f.name, staticImport.at, staticImport.at + 6, { label: "Adicionar \"type\": \"module\"", kind: "set", path: ["background", "type"], value: "module" });
      const imp = refs.find((x) => x.how === "importScripts");
      if (imp && swType === "module") FP("error", "importScripts não funciona em service worker do tipo module. Use import.", f.name, imp.at, imp.at + 13);
      const dom = /\b(document\s*\.|window\s*\.(?!setTimeout|clearTimeout|setInterval|clearInterval|fetch|addEventListener)|localStorage\b|sessionStorage\b|XMLHttpRequest\b)/.exec(code);
      if (dom) FP("warning", "O service worker não tem DOM, window, localStorage nem XMLHttpRequest. Use chrome.storage, fetch e um documento offscreen se precisar do DOM.", f.name, dom.index, dom.index + dom[0].length);
    }
    if (r === "content") {
      const st = refs.find((x) => x.how === "import");
      if (st) FP("error", "Content scripts não podem usar import estático. Junte o código num arquivo ou use import(chrome.runtime.getURL(…)) com web_accessible_resources.", f.name, st.at, st.at + 6);
    }
  }

  /* ---------- APIs usadas × permissões ---------- */
  for (const [ns, where] of apis) {
    const need = ns === "declarativeNetRequest" ? (declared.has("declarativeNetRequestWithHostAccess") ? null : "declarativeNetRequest") : API_PERMISSION[ns];
    if (!need || perms.includes(need)) continue;
    const file = where[0];
    const f = byName.get(file)!;
    const pos = blankComments(f.content).search(new RegExp(`\\bchrome\\s*\\.\\s*${ns.replace(".", "\\s*\\.\\s*")}\\b`));
    if (optPerms.includes(need)) FP("info", `chrome.${ns} depende da permissão opcional “${need}”: chame chrome.permissions.request antes de usar.`, file, Math.max(0, pos), Math.max(0, pos) + 7 + ns.length);
    else FP("error", `chrome.${ns} é usado em ${where.join(", ")}, mas a permissão “${need}” não está no manifesto. Sem ela, chrome.${ns} fica undefined.`, file, Math.max(0, pos), Math.max(0, pos) + 7 + ns.length, { label: `Adicionar a permissão ${need}`, kind: "add-perm", perm: need });
  }
  perms.forEach((p, i) => {
    const info = PERM.get(p);
    if (!info?.api || (p === "sidePanel" && m.side_panel)) return;
    const used = [...apis.keys()].some((ns) => API_PERMISSION[ns] === p || (p.startsWith("declarativeNetRequest") && ns === "declarativeNetRequest"));
    if (!used) P("info", `A permissão “${p}” está declarada, mas nenhum arquivo usa chrome.${info.api}. Se não precisa, remova: menos permissões, menos avisos.`, ["permissions", i], { label: `Remover ${p}`, kind: "remove", path: ["permissions", i] });
  });

  const order: Record<Sev, number> = { error: 0, warning: 1, info: 2 };
  problems.sort((a, b) => order[a.sev] - order[b.sev] || (a.file === MANIFEST ? -1 : 0) - (b.file === MANIFEST ? -1 : 0) || a.from - b.from);
  return { manifest: m, parseError: null, entries, problems, apis };
}

/** Arquivo inicial para uma referência que não existe. */
function starterFor(e: EntryRef): ExtFix | undefined {
  const name = baseName(e.path).replace(/\.\w+$/, "");
  const page = (title: string, js: string) =>
    `<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n  <meta charset="UTF-8">\n  <title>${title}</title>\n</head>\n<body>\n  <h1>${title}</h1>\n  <!-- Scripts inline são bloqueados no MV3: ponha o código em ${js} e carregue com uma tag script com src -->\n</body>\n</html>\n`;
  if (["popup", "options", "sidepanel", "devtools", "override"].includes(e.role) && /\.html?$/i.test(e.path))
    return { label: `Criar ${e.path}`, kind: "create", file: e.path, content: page(e.label, baseName(e.path).replace(/\.html?$/i, ".js")) };
  if ((e.role === "background" || e.role === "content") && /\.m?js$/i.test(e.path)) return { label: `Criar ${e.path}`, kind: "create", file: e.path, content: `// ${e.label}: ${name}\n` };
  if (e.role === "content-css") return { label: `Criar ${e.path}`, kind: "create", file: e.path, content: `/* ${e.label} */\n` };
  return undefined;
}

/* ---------------- correções ---------------- */

/** Aplica uma correção e devolve os arquivos a criar ou trocar (nome → conteúdo). */
export function applyFix(files: PFile[], fix: ExtFix): Record<string, string> | null {
  const mf = manifestFile(files);
  const edit = (fn: (m: Json) => void) => {
    if (!mf) return null;
    const out = editManifest(mf.content, fn);
    return out == null ? null : { [MANIFEST]: out };
  };
  switch (fix.kind) {
    case "set":
      return edit((m) => setAt(m, fix.path, fix.value));
    case "remove":
      return edit((m) => setAt(m, fix.path, undefined));
    case "rename-key":
      return edit((m) => {
        const copy: Json = {};
        for (const k of Object.keys(m)) copy[k === fix.from ? fix.to : k] = m[k];
        for (const k of Object.keys(m)) delete m[k];
        Object.assign(m, copy);
      });
    case "add-perm":
      return edit((m) => {
        const list: string[] = Array.isArray(m.permissions) ? m.permissions : [];
        if (!list.includes(fix.perm)) list.push(fix.perm);
        m.permissions = list;
        if (Array.isArray(m.optional_permissions)) m.optional_permissions = m.optional_permissions.filter((p: string) => p !== fix.perm);
      });
    case "move-host":
      return edit((m) => {
        m.permissions = (m.permissions ?? []).filter((p: string) => p !== fix.value);
        const h: string[] = Array.isArray(m.host_permissions) ? m.host_permissions : [];
        if (!h.includes(fix.value)) h.push(fix.value);
        m.host_permissions = h;
      });
    case "mv2-background":
      return edit((m) => {
        const scripts: string[] = Array.isArray(m.background?.scripts) ? m.background.scripts : [];
        m.background = { service_worker: scripts[0] ?? "background.js" };
      });
    case "war-v3":
      return edit((m) => {
        const strs = (m.web_accessible_resources as Json[]).filter((x) => typeof x === "string");
        const objs = (m.web_accessible_resources as Json[]).filter((x) => typeof x !== "string");
        m.web_accessible_resources = [...objs, { resources: strs, matches: ["<all_urls>"] }];
      });
    case "csp-v3":
      return edit((m) => {
        const old = String(m.content_security_policy);
        const safe = !/unsafe-eval|unsafe-inline|https?:/.test(old);
        if (safe) m.content_security_policy = { extension_pages: old };
        else delete m.content_security_policy;
      });
    case "create":
      return files.some((f) => f.name === fix.file) ? null : { [fix.file]: fix.content };
    case "extract-inline": {
      const f = files.find((x) => x.name === fix.file);
      if (!f) return null;
      const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
      re.lastIndex = fix.at;
      const s = re.exec(f.content);
      if (!s || s.index !== fix.at) return null;
      const dir = dirName(f.name);
      const stem = baseName(f.name).replace(/\.html?$/i, "");
      const taken = new Set(files.map((x) => x.name));
      let js = (dir ? dir + "/" : "") + stem + ".js";
      for (let i = 2; taken.has(js); i++) js = (dir ? dir + "/" : "") + `${stem}-${i}.js`;
      const attrs = s[1].replace(/\s+$/, "");
      const tag = `<script${attrs} src="${baseName(js)}"></script>`;
      const code = s[2].replace(/^\n/, "").replace(/\s+$/, "") + "\n";
      return { [f.name]: f.content.slice(0, s.index) + tag + f.content.slice(s.index + s[0].length), [js]: code };
    }
  }
}

/** Valor no manifesto para mostrar na interface (sem quebrar se o tipo vier errado). */
export const field = (m: Json, path: JPath, fallback = ""): string => {
  const v = getAt(m, path);
  return typeof v === "string" ? v : fallback;
};
