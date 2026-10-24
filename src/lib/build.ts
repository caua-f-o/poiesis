import runtimeSrc from "./runtime.js?raw";
import type { PFile, Project } from "./types";
import { dirName, findFile, resolvePath } from "./files";

export interface BuildOptions {
  /** injeta o runtime com console, REPL e navegação (preview) */
  console: boolean;
  autoInject: boolean;
}

export interface BuildResult {
  html: string;
  page: PFile | null;
  /** caminhos referenciados que não existem no projeto */
  missing: string[];
}

const ATTR_RE = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function parseAttrs(src: string) {
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(src))) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return out;
}

function stripAttr(attrs: string, name: string) {
  return attrs.replace(new RegExp(`\\s${name}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, "i"), "");
}

const escapeScript = (code: string) => code.replace(/<\/(script)/gi, "<\\/$1");

function svgToDataURL(svg: string) {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

const HAS_ESM = /(^|[\n;])\s*(import\s*[\w*{"'$]|export\s)/;

export function buildPage(project: Project, pageId: string | null, opts: BuildOptions): BuildResult {
  const files = project.files;
  const page =
    files.find((f) => f.id === pageId && f.kind === "html") ??
    files.find((f) => f.id === project.entry && f.kind === "html") ??
    files.find((f) => f.kind === "html") ??
    null;

  const used = new Set<string>();
  const missing = new Set<string>();
  const pageDir = page ? dirName(page.name) : "";

  const assetURL = (ref: string, fromDir: string): string | null => {
    if (!ref || /^(data|blob|https?|mailto|tel|javascript):/i.test(ref) || ref.startsWith("#") || ref.startsWith("//")) return null;
    const f = findFile(files, ref, fromDir);
    if (!f) {
      const p = resolvePath(ref, fromDir);
      if (p && !/\.html?$/i.test(p)) missing.add(p);
      return null;
    }
    if (f.kind === "asset") return f.content;
    if (/\.svg$/i.test(f.name)) return svgToDataURL(f.content);
    return null;
  };

  const rewriteImports = (code: string, fromDir: string) => {
    const swap = (spec: string) => {
      if (!/^(\.{1,2}\/|\/)/.test(spec)) return spec;
      const f = findFile(files, spec, fromDir);
      if (!f || f.kind !== "js") return spec;
      used.add(f.id);
      return "@poiesis/" + f.name;
    };
    return code
      .replace(
        /(\bimport\s*(?:[\w*$\s{},]+?\s*from\s*)?|\bexport\s*(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s*)(["'])([^"'\n]+)\2/g,
        (_m, head, q, spec) => `${head}${q}${swap(spec)}${q}`
      )
      .replace(/\bimport\s*\(\s*(["'])([^"'\n]+)\1\s*\)/g, (_m, q, spec) => `import(${q}${swap(spec)}${q})`);
  };

  const processCss = (css: string, fromDir: string, depth = 0): string => {
    let out = css.replace(
      /@import\s+(?:url\(\s*)?(["']?)([^"')\s;]+)\1\s*\)?\s*([^;]*);/g,
      (m, _q, ref, media) => {
        const f = findFile(files, ref, fromDir);
        if (!f || f.kind !== "css" || depth > 6) return m;
        used.add(f.id);
        const inner = processCss(f.content, dirName(f.name), depth + 1);
        return media.trim() ? `@media ${media.trim()} {\n${inner}\n}` : inner;
      }
    );
    out = out.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (m, q, ref) => {
      const url = assetURL(ref, fromDir);
      return url ? `url(${q || '"'}${url}${q || '"'})` : m;
    });
    return out;
  };

  const jsTag = (f: PFile, extraAttrs = "") => {
    const isModule = /type\s*=\s*["']?module/i.test(extraAttrs) || HAS_ESM.test(f.content);
    const code = isModule ? rewriteImports(f.content, dirName(f.name)) : f.content;
    const attrs = isModule && !/type\s*=/.test(extraAttrs) ? `${extraAttrs} type="module"` : extraAttrs;
    return `<script${attrs} data-poiesis-file="${f.name}">${escapeScript(code)}\n//# sourceURL=${f.name}\n</script>`;
  };

  let html = page
    ? page.content
    : '<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n<meta charset="UTF-8">\n</head>\n<body>\n</body>\n</html>';
  if (page) used.add(page.id);

  // 1) scripts (primeiro, para os offsets ainda baterem com o arquivo original)
  html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (m, rawAttrs: string, body: string, offset: number) => {
    const attrs = parseAttrs(rawAttrs);
    const type = (attrs.type || "").toLowerCase();
    const isJs = !type || type === "module" || /javascript|ecmascript/.test(type);
    if (attrs.src !== undefined) {
      const f = findFile(files, attrs.src, pageDir);
      if (f && f.kind === "js") {
        used.add(f.id);
        return jsTag(f, stripAttr(stripAttr(rawAttrs, "src"), "defer").replace(/\s+$/, ""));
      }
      if (!/^(https?:)?\/\//i.test(attrs.src) && !/^(data|blob):/i.test(attrs.src)) {
        const p = resolvePath(attrs.src, pageDir);
        if (p) missing.add(p);
      }
      return m;
    }
    if (!isJs || !body.trim() || !page) return m;
    const openLen = m.indexOf(">") + 1;
    const line = (html.slice(0, offset + openLen).match(/\n/g)?.length ?? 0) + 1;
    const code = type === "module" || HAS_ESM.test(body) ? rewriteImports(body, pageDir) : body;
    return `<script${rawAttrs}>${"\n".repeat(line - 1)}${code}\n//# sourceURL=${page.name}\n</script>`;
  });

  // 2) <style> embutidos
  html = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi, (_m, a, body, c) => a + processCss(body, pageDir) + c);

  // 3) <link rel="stylesheet">
  html = html.replace(/<link\b([^>]*?)\/?>/gi, (m, rawAttrs: string) => {
    const attrs = parseAttrs(rawAttrs);
    if (!attrs.href) return m;
    const rel = (attrs.rel || "").toLowerCase();
    if (rel.includes("stylesheet")) {
      const f = findFile(files, attrs.href, pageDir);
      if (f && f.kind === "css") {
        used.add(f.id);
        const media = attrs.media ? ` media="${attrs.media}"` : "";
        return `<style data-poiesis-file="${f.name}"${media}>\n${processCss(f.content, dirName(f.name))}\n</style>`;
      }
      if (!/^(https?:)?\/\//i.test(attrs.href)) {
        const p = resolvePath(attrs.href, pageDir);
        if (p) missing.add(p);
      }
      return m;
    }
    const url = assetURL(attrs.href, pageDir);
    return url ? m.replace(attrs.href, url) : m;
  });

  // 4) atributos que apontam para assets
  html = html.replace(/(\s(?:src|poster|data|xlink:href)\s*=\s*)(["'])([^"']*)\2/gi, (m, pre, q, ref) => {
    const url = assetURL(ref, pageDir);
    return url ? `${pre}${q}${url}${q}` : m;
  });
  html = html.replace(/(<(?:img|source)\b[^>]*?\ssrcset\s*=\s*)(["'])([^"']*)\2/gi, (_m, pre, q, set: string) => {
    const parts = set.split(",").map((p) => {
      const [ref, ...rest] = p.trim().split(/\s+/);
      const url = assetURL(ref, pageDir);
      return [url ?? ref, ...rest].join(" ");
    });
    return `${pre}${q}${parts.join(", ")}${q}`;
  });
  html = html.replace(/(\sstyle\s*=\s*)(["'])([^"']*url\([^"']*)\2/gi, (_m, pre, q, css) => `${pre}${q}${processCss(css, pageDir)}${q}`);

  // 5) módulos importados por outros módulos contam como "usados"
  const jsFiles = files.filter((f) => f.kind === "js");
  const anyEsm = jsFiles.some((f) => HAS_ESM.test(f.content)) || /type\s*=\s*["']?module/i.test(html);
  const modules: Record<string, string> = {};
  if (anyEsm) {
    for (const f of jsFiles) modules[f.name] = rewriteImports(f.content, dirName(f.name)) + `\n//# sourceURL=${f.name}`;
  }

  // 6) injeção automática dos CSS/JS não referenciados
  if (opts.autoInject) {
    const css = files.filter((f) => f.kind === "css" && !used.has(f.id));
    const js = jsFiles.filter((f) => !used.has(f.id));
    if (css.length) {
      const block = css
        .map((f) => `<style data-poiesis-file="${f.name}" data-poiesis-auto>\n${processCss(f.content, dirName(f.name))}\n</style>`)
        .join("\n");
      html = /<\/head\s*>/i.test(html) ? html.replace(/<\/head\s*>/i, `${block}\n</head>`) : block + "\n" + html;
    }
    if (js.length) {
      const block = js.map((f) => jsTag(f, " data-poiesis-auto")).join("\n");
      html = /<\/body\s*>/i.test(html) ? html.replace(/<\/body\s*>(?![\s\S]*<\/body)/i, `${block}\n</body>`) : html + "\n" + block;
    }
  }

  // 7) runtime (fetch virtual, módulos, console)
  const vfs: Record<string, { m: string; t?: string; d?: string }> = {};
  for (const f of files) {
    if (f.kind === "css" || f.kind === "js") continue;
    const entry = f.kind === "asset" ? { m: f.mime || "application/octet-stream", d: f.content } : { m: f.mime || "text/plain", t: f.content };
    vfs[f.name] = entry;
    vfs[f.name.toLowerCase()] = entry;
  }
  const needRuntime = opts.console || anyEsm || Object.keys(vfs).some((k) => !/\.html?$/i.test(k));
  if (needRuntime) {
    const cfg = { console: opts.console, dir: pageDir, files: vfs, modules: anyEsm ? modules : null };
    const json = JSON.stringify(cfg).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    const tag = `<script data-poiesis-runtime>${runtimeSrc.replace("/*__CFG__*/", json)}</script>`;
    if (/<head\b[^>]*>/i.test(html)) html = html.replace(/<head\b[^>]*>/i, (h) => h + tag);
    else if (/<html\b[^>]*>/i.test(html)) html = html.replace(/<html\b[^>]*>/i, (h) => h + tag);
    else if (/<!doctype[^>]*>/i.test(html)) html = html.replace(/<!doctype[^>]*>/i, (h) => h + tag);
    else html = tag + html;
  }

  return { html, page, missing: [...missing] };
}
