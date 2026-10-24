import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Icon } from "./Icon";
import { IconButton, Tip } from "./md";
import { cn } from "@/lib/utils";
import {
  PREVIEW_FAMILY,
  STYLE_LABEL,
  ensurePreviewFonts,
  loadSymbolNames,
  searchSymbols,
  spanFor,
  type SymbolOptions,
  type SymbolStyle,
} from "@/lib/symbols";

export type InsertMode = "html" | "name" | "css";

export interface SymbolPick {
  name: string;
  options: SymbolOptions;
  mode: InsertMode;
  code: string;
  addLink: boolean;
}

const RECENT_KEY = "poiesis:recent-symbols";
const PREFS_KEY = "poiesis:symbol-prefs";

const loadRecent = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
};
const loadPrefs = (): { style: SymbolStyle; fill: boolean; weight: number; addLink: boolean } => {
  try {
    return { style: "rounded", fill: false, weight: 400, addLink: true, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") };
  } catch {
    return { style: "rounded", fill: false, weight: 400, addLink: true };
  }
};

export function codeFor(name: string, o: SymbolOptions, mode: InsertMode) {
  if (mode === "name") return name;
  if (mode === "css") {
    const extra = o.fill || o.weight !== 400 ? `\nfont-variation-settings: 'FILL' ${o.fill ? 1 : 0}, 'wght' ${o.weight};` : "";
    return `font-family: "Material Symbols ${STYLE_LABEL[o.style]}";\ncontent: "${name}";${extra}`;
  }
  return spanFor(name, o);
}

interface Props {
  open: boolean;
  onOpenChange(o: boolean): void;
  /** linguagem no cursor: define o formato padrão de inserção */
  lang: "html" | "css" | "js" | "other";
  /** ícone já existente no cursor (substituição) */
  current: { name: string; style: string } | null;
  onPick(p: SymbolPick): void;
  onCopy(text: string): void;
  onClosed?(): void;
}

const PAGE = 240;

export function SymbolPicker({ open, onOpenChange, lang, current, onPick, onCopy, onClosed }: Props) {
  const [all, setAll] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [prefs, setPrefs] = useState(loadPrefs);
  const [size, setSize] = useState<number | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const defaultMode: InsertMode = lang === "css" ? "css" : lang === "js" ? "name" : "html";
  const [mode, setMode] = useState<InsertMode>(defaultMode);
  const grid = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    ensurePreviewFonts();
    loadSymbolNames().then(setAll);
    setMode(defaultMode);
    setLimit(PAGE);
    if (current) {
      setQ(current.name);
      setSel(current.name);
      if (current.style in STYLE_LABEL) setPrefs((p) => ({ ...p, style: current.style as SymbolStyle }));
    } else {
      setQ("");
      setSel(null);
    }
    setTimeout(() => input.current?.select(), 50);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* ignora */
    }
  }, [prefs]);

  const results = useMemo(() => (all.length ? searchSymbols(all, q, 4000) : []), [all, q]);
  const shown = results.slice(0, limit);

  useEffect(() => {
    setLimit(PAGE);
    grid.current?.scrollTo({ top: 0 });
    if (results.length && (!sel || !results.includes(sel))) setSel(results[0]);
  }, [results]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setLimit((l) => l + PAGE), { root: grid.current, rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [open, results]);

  const options: SymbolOptions = { style: prefs.style, fill: prefs.fill, weight: prefs.weight, size };
  const code = sel ? codeFor(sel, options, mode) : "";
  const family = PREVIEW_FAMILY[prefs.style];
  const glyph = (fill: boolean): React.CSSProperties => ({
    fontFamily: `"${family}"`,
    fontFeatureSettings: '"liga"',
    fontVariationSettings: `"FILL" ${fill ? 1 : 0}`,
    lineHeight: 1,
    fontWeight: "normal",
  });

  const pick = (name = sel) => {
    if (!name) return;
    const next = [name, ...recent.filter((r) => r !== name)].slice(0, 24);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* ignora */
    }
    onPick({ name, options, mode, code: codeFor(name, options, mode), addLink: prefs.addLink && mode !== "name" });
    onOpenChange(false);
  };

  const cols = () => {
    const g = grid.current?.querySelector<HTMLElement>("[data-grid]");
    return g ? Math.max(1, getComputedStyle(g).gridTemplateColumns.split(" ").length) : 6;
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!sel || !shown.length) return;
    const inInput = (e.target as HTMLElement).tagName === "INPUT";
    if (inInput && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return;
    const i = shown.indexOf(sel);
    const move = (d: number) => {
      e.preventDefault();
      const n = shown[Math.max(0, Math.min(shown.length - 1, i + d))];
      setSel(n);
      grid.current?.querySelector(`[data-name="${n}"]`)?.scrollIntoView({ block: "nearest" });
    };
    if (e.key === "ArrowRight") move(1);
    else if (e.key === "ArrowLeft") move(-1);
    else if (e.key === "ArrowDown") move(cols());
    else if (e.key === "ArrowUp") move(-cols());
    else if (e.key === "Enter") {
      e.preventDefault();
      pick();
    }
  };

  const cell = (name: string) => (
    <button
      key={name}
      data-name={name}
      onClick={() => setSel(name)}
      onDoubleClick={() => pick(name)}
      title={name}
      className={cn(
        "md-item h-[84px] min-w-0 flex-col justify-center gap-1.5 !rounded-2xl px-1",
        sel === name && "bg-md-secondary-c text-md-on-secondary-c outline outline-2 outline-md-primary"
      )}
    >
      <span style={{ ...glyph(prefs.fill), fontSize: 30 }} className="text-md-on-surface">
        {name}
      </span>
      <span className="w-full truncate text-center text-[10.5px]">{name.replace(/_/g, " ")}</span>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(680px,90vh)] max-w-[980px] flex-col gap-0 overflow-hidden p-0"
        onKeyDown={onKey}
        onCloseAutoFocus={(e) => {
          // o foco volta para o editor (feito pelo App), não para o <body>
          e.preventDefault();
          onClosed?.();
        }}
      >
        {/* cabeçalho */}
        <div className="flex flex-wrap items-center gap-3 border-b border-md-outline-v px-6 pb-4 pr-16 pt-5">
          <div className="mr-2">
            <DialogTitle className="font-display text-[26px] italic leading-7">Material Symbols</DialogTitle>
            <DialogDescription className="text-[12px]">
              {all.length ? `${all.length.toLocaleString("pt-BR")} ícones · busque em português ou inglês` : "carregando…"}
            </DialogDescription>
          </div>
          <div className="md-search h-11 min-w-[240px] flex-1 cursor-text pl-4" onClick={() => input.current?.focus()}>
            <Icon name="search" size={21} />
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="casa, seta, coração, settings…"
              className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-md-on-surface outline-none placeholder:text-md-outline"
            />
            {q && <IconButton icon="close" label="Limpar" size="xs" onClick={() => setQ("")} />}
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* grade */}
          <div ref={grid} className="min-h-0 flex-1 overflow-y-auto p-3">
            {!q && recent.length > 0 && (
              <>
                <div className="eyebrow px-2 pb-1 pt-1">Recentes</div>
                <div className="mb-3 grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-1">{recent.filter((r) => all.includes(r)).map(cell)}</div>
                <div className="eyebrow px-2 pb-1">Populares</div>
              </>
            )}
            {all.length > 0 && !results.length && (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-md-on-variant">
                <Icon name="search_off" size={36} />
                Nenhum ícone para “{q}”. Tente em inglês.
              </div>
            )}
            <div data-grid className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-1">{shown.map(cell)}</div>
            {shown.length < results.length && <div ref={sentinel} className="h-8" />}
          </div>

          {/* detalhes */}
          <aside className="flex w-[300px] shrink-0 flex-col border-l border-md-outline-v bg-md-low">
           <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5 pb-3">
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-md-container py-5">
              <span style={{ ...glyph(prefs.fill), fontSize: 72 }} className="text-md-primary">
                {sel ?? "add"}
              </span>
              <code className="font-code text-[13px] text-md-on-surface">{sel ?? "—"}</code>
              {current && sel !== current.name && <span className="text-[11.5px] text-md-on-variant">substitui “{current.name}”</span>}
            </div>

            <div className="grid gap-2">
              <span className="text-[12px] font-medium text-md-on-variant">Estilo</span>
              <div className="md-seg w-full">
                {(["outlined", "rounded", "sharp"] as SymbolStyle[]).map((s) => (
                  <button key={s} data-on={prefs.style === s} onClick={() => setPrefs((p) => ({ ...p, style: s }))} className="flex-1 !px-1">
                    {STYLE_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center justify-between gap-3 text-[13px]">
              Preenchido (FILL)
              <Switch checked={prefs.fill} onCheckedChange={(v) => setPrefs((p) => ({ ...p, fill: v }))} />
            </label>

            <div className="grid gap-2">
              <span className="flex justify-between text-[12px] font-medium text-md-on-variant">
                Peso <span className="font-code">{prefs.weight}</span>
              </span>
              <Slider min={100} max={700} step={100} value={[prefs.weight]} onValueChange={([v]) => setPrefs((p) => ({ ...p, weight: v }))} />
            </div>

            <div className="grid gap-2">
              <span className="flex justify-between text-[12px] font-medium text-md-on-variant">
                Tamanho <span className="font-code">{size ? `${size}px` : "herdado"}</span>
              </span>
              <Slider min={0} max={96} step={4} value={[size ?? 0]} onValueChange={([v]) => setSize(v || null)} />
            </div>

            <div className="grid gap-2">
              <span className="text-[12px] font-medium text-md-on-variant">Inserir como</span>
              <div className="md-seg w-full">
                {(
                  [
                    ["html", "HTML"],
                    ["name", "Nome"],
                    ["css", "CSS"],
                  ] as const
                ).map(([m, label]) => (
                  <button key={m} data-on={mode === m} onClick={() => setMode(m)} className="flex-1 !px-1">
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {mode !== "name" && (
              <label className="flex items-start justify-between gap-3 text-[12.5px] leading-snug">
                <span>
                  Adicionar o &lt;link&gt; da fonte
                  <span className="block text-[11.5px] text-md-on-variant">no &lt;head&gt;, se ainda não estiver lá</span>
                </span>
                <Switch checked={prefs.addLink} onCheckedChange={(v) => setPrefs((p) => ({ ...p, addLink: v }))} />
              </label>
            )}

           </div>
           <div className="flex shrink-0 flex-col gap-2 border-t border-md-outline-v p-4">
            <pre className="selectable max-h-24 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-[var(--syn-bg)] p-3 font-code text-[11.5px] leading-relaxed text-[var(--syn-fg)]">{code}</pre>

            <div className="flex gap-2">
              <Tip label="Copiar código">
                <button className="md-btn md-btn-outlined flex-1" disabled={!sel} onClick={() => sel && onCopy(code)}>
                  <Icon name="content_copy" size={18} /> Copiar
                </button>
              </Tip>
              <button className="md-btn md-btn-filled flex-1" disabled={!sel} onClick={() => pick()}>
                <Icon name={current ? "find_replace" : "add"} size={20} /> {current ? "Trocar" : "Inserir"}
              </button>
            </div>
            <p className="text-center text-[11px] text-md-outline">Enter insere · setas navegam · duplo clique também</p>
           </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
