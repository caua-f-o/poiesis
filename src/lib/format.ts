import type { FileKind } from "./types";

export async function formatCode(code: string, kind: FileKind, tabWidth: number, name = ""): Promise<string> {
  const prettier = await import("prettier/standalone");
  const base = { tabWidth, printWidth: 100, useTabs: false };
  switch (kind) {
    case "html": {
      const [html, postcss, babel, estree] = await Promise.all([
        import("prettier/plugins/html"),
        import("prettier/plugins/postcss"),
        import("prettier/plugins/babel"),
        import("prettier/plugins/estree"),
      ]);
      return prettier.format(code, { ...base, parser: "html", plugins: [html, postcss, babel, estree] });
    }
    case "css": {
      const postcss = await import("prettier/plugins/postcss");
      return prettier.format(code, { ...base, parser: "css", plugins: [postcss] });
    }
    case "js":
    case "json": {
      const [babel, estree] = await Promise.all([import("prettier/plugins/babel"), import("prettier/plugins/estree")]);
      return prettier.format(code, { ...base, parser: kind === "json" ? "json" : "babel", plugins: [babel, estree] });
    }
    default:
      if (/\.(md|markdown)$/i.test(name)) {
        const md = await import("prettier/plugins/markdown");
        return prettier.format(code, { ...base, parser: "markdown", plugins: [md], proseWrap: "preserve" });
      }
      return code;
  }
}

export const canFormat = (kind: FileKind, name = "") =>
  kind === "html" || kind === "css" || kind === "js" || kind === "json" || /\.(md|markdown)$/i.test(name);
