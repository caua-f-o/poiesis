import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { PFile } from "@/lib/types";
import { dirName, findFile } from "@/lib/files";

marked.setOptions({ gfm: true, breaks: false });

interface Props {
  file: PFile;
  files: PFile[];
  onOpenFile(id: string): void;
}

/** Markdown renderizado com o tema atual. Imagens e links relativos apontam para arquivos do projeto. */
export function MarkdownView({ file, files, onOpenFile }: Props) {
  const html = useMemo(() => {
    const raw = marked.parse(file.content, { async: false }) as string;
    const clean = DOMPurify.sanitize(raw, { ADD_ATTR: ["target"] });
    const tpl = document.createElement("template");
    tpl.innerHTML = clean;
    const dir = dirName(file.name);
    tpl.content.querySelectorAll("img[src]").forEach((img) => {
      const src = img.getAttribute("src") || "";
      if (/^(data|https?|blob):/i.test(src)) return;
      const f = findFile(files, src, dir);
      if (!f) {
        img.removeAttribute("src");
        img.setAttribute("title", `Imagem não encontrada no projeto: ${src}`);
        img.setAttribute("style", "display:inline-block;min-width:120px;min-height:40px;border:1px dashed var(--md-outline);border-radius:8px;padding:8px");
        return;
      }
      img.setAttribute("src", f.kind === "asset" ? f.content : "data:image/svg+xml;charset=utf-8," + encodeURIComponent(f.content));
    });
    tpl.content.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (/^(https?:|mailto:)/i.test(href)) {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener");
        return;
      }
      if (href.startsWith("#")) return;
      const f = findFile(files, href, dir);
      if (f) a.setAttribute("data-file", f.id);
    });
    return tpl.innerHTML;
  }, [file.content, file.name, files]);

  return (
    <div
      className="h-full overflow-y-auto"
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest("a");
        if (!a) return;
        const id = a.getAttribute("data-file");
        if (id) {
          e.preventDefault();
          onOpenFile(id);
        } else if (a.getAttribute("href")?.startsWith("#")) {
          e.preventDefault();
          const t = (e.currentTarget as HTMLElement).querySelector(`[id="${CSS.escape(a.getAttribute("href")!.slice(1))}"]`);
          t?.scrollIntoView({ behavior: "smooth" });
        }
      }}
    >
      <article className="pz-md" dangerouslySetInnerHTML={{ __html: html || '<p style="opacity:.5">Documento vazio.</p>' }} />
    </div>
  );
}

export const isMarkdown = (f: PFile | null) => !!f && /\.(md|markdown)$/i.test(f.name);
