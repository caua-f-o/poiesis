import { useEffect, useMemo, useRef, useState } from "react";
import type { PFile } from "@/lib/types";
import { Icon } from "./Icon";
import { IconButton, PanelHeader } from "./md";
import { fileIcon } from "./fileIcon";
import { cn } from "@/lib/utils";

interface Hit {
  line: number;
  col: number;
  text: string;
  start: number;
  end: number;
}

interface Props {
  files: PFile[];
  seed: { q: string; n: number } | null;
  onJump(fileId: string, line: number, col: number): void;
  onReplaceAll(changes: { id: string; content: string }[], count: number): void;
}

/** Busca (e substituição) em todos os arquivos do projeto. */
export function SearchPanel({ files, seed, onJump, onReplaceAll }: Props) {
  const [q, setQ] = useState("");
  const [rep, setRep] = useState("");
  const [showRep, setShowRep] = useState(false);
  const [cs, setCs] = useState(false);
  const [word, setWord] = useState(false);
  const [rx, setRx] = useState(false);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (seed) {
      setQ(seed.q);
      setTimeout(() => inputRef.current?.select(), 30);
    } else inputRef.current?.focus();
  }, [seed]);

  const { re, error } = useMemo(() => {
    if (!q) return { re: null, error: "" };
    try {
      const src = rx ? q : q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return { re: new RegExp(word ? `\\b${src}\\b` : src, cs ? "g" : "gi"), error: "" };
    } catch (e) {
      return { re: null, error: String((e as Error).message) };
    }
  }, [q, cs, word, rx]);

  const results = useMemo(() => {
    if (!re) return [];
    const out: { file: PFile; hits: Hit[] }[] = [];
    for (const f of files) {
      if (f.kind === "asset") continue;
      const hits: Hit[] = [];
      const lines = f.content.split("\n");
      for (let i = 0; i < lines.length && hits.length < 500; i++) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(lines[i]))) {
          if (!m[0].length) {
            re.lastIndex++;
            continue;
          }
          hits.push({ line: i + 1, col: m.index + 1, text: lines[i], start: m.index, end: m.index + m[0].length });
          if (hits.length >= 500) break;
        }
      }
      if (hits.length) out.push({ file: f, hits });
    }
    return out;
  }, [files, re]);

  const total = results.reduce((n, r) => n + r.hits.length, 0);

  const replaceAll = () => {
    if (!re || !total) return;
    const changes = results.map((r) => ({ id: r.file.id, content: r.file.content.replace(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"), rep) }));
    onReplaceAll(changes, total);
  };

  const toggle = (on: boolean, set: (v: boolean) => void, icon: string, label: string) => (
    <IconButton icon={icon} label={label} size="xs" on={on} iconSize={17} onClick={() => set(!on)} />
  );

  return (
    <div className="flex h-full flex-col">
      <PanelHeader title="Buscar no projeto" />
      <div className="flex flex-col gap-2 px-3 pb-3">
        <div className="flex items-start gap-1">
          <IconButton icon={showRep ? "expand_more" : "chevron_right"} label="Substituir" size="xs" onClick={() => setShowRep(!showRep)} className="mt-1" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex h-9 items-center rounded-lg border border-md-outline pl-3 pr-1 focus-within:border-md-primary focus-within:shadow-[inset_0_0_0_1px_var(--md-primary)]">
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar"
                className="min-w-0 flex-1 bg-transparent font-code text-[12.5px] outline-none placeholder:font-sans placeholder:text-md-outline"
              />
              {toggle(cs, setCs, "match_case", "Diferenciar maiúsculas")}
              {toggle(word, setWord, "match_word", "Palavra inteira")}
              {toggle(rx, setRx, "regular_expression", "Expressão regular")}
            </div>
            {showRep && (
              <div className="flex h-9 items-center rounded-lg border border-md-outline pl-3 pr-1 focus-within:border-md-primary">
                <input value={rep} onChange={(e) => setRep(e.target.value)} placeholder="Substituir por" className="min-w-0 flex-1 bg-transparent font-code text-[12.5px] outline-none placeholder:font-sans placeholder:text-md-outline" />
                <IconButton icon="find_replace" label="Substituir tudo" size="xs" iconSize={18} disabled={!total} onClick={replaceAll} />
              </div>
            )}
          </div>
        </div>
        <div className="px-1 text-[11.5px] text-md-on-variant">
          {error ? <span className="text-md-error">{error}</span> : q ? `${total} resultado${total === 1 ? "" : "s"} em ${results.length} arquivo${results.length === 1 ? "" : "s"}` : "Busca em HTML, CSS, JS e textos do projeto."}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {results.map(({ file, hits }) => {
          const { icon, color } = fileIcon(file);
          const isClosed = closed.has(file.id);
          return (
            <div key={file.id} className="mb-1">
              <button
                className="md-item h-8 gap-1.5 px-2"
                onClick={() =>
                  setClosed((s) => {
                    const n = new Set(s);
                    if (n.has(file.id)) n.delete(file.id);
                    else n.add(file.id);
                    return n;
                  })
                }
              >
                <Icon name={isClosed ? "chevron_right" : "keyboard_arrow_down"} size={18} className="text-md-outline" />
                <span className="msr" style={{ fontSize: 16, color }}>
                  {icon}
                </span>
                <span className="truncate font-code text-[12px] text-md-on-surface">{file.name}</span>
                <span className="ml-auto rounded-full bg-md-high px-2 text-[10.5px] font-semibold tabular-nums">{hits.length}</span>
              </button>
              {!isClosed &&
                hits.slice(0, 200).map((h, i) => {
                  const pre = h.text.slice(Math.max(0, h.start - 24), h.start);
                  return (
                    <button key={i} onClick={() => onJump(file.id, h.line, h.col)} className="md-item h-7 gap-2 pl-9 pr-2">
                      <span className="w-7 shrink-0 text-right font-code text-[10.5px] tabular-nums text-md-outline">{h.line}</span>
                      <span className="truncate font-code text-[11.5px]">
                        {h.start > 24 && "…"}
                        {pre.trimStart()}
                        <mark className={cn("rounded-[3px] bg-[color-mix(in_oklab,var(--md-warn)_35%,transparent)] px-0.5 text-md-on-surface")}>{h.text.slice(h.start, h.end)}</mark>
                        {h.text.slice(h.end, h.end + 60)}
                      </span>
                    </button>
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
