// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
import { useEffect, useMemo, useRef, useState } from "react";
import type { LogEntry, LogLevel, Ser } from "@/lib/types";
import { Icon } from "./Icon";
import { IconButton } from "./md";
import { cn } from "@/lib/utils";

/* ---------------- valores ---------------- */

function Preview({ v, top }: { v: Ser; top?: boolean }) {
  switch (v.t) {
    case "str":
      return top ? <span className="whitespace-pre-wrap break-words text-[var(--paper)]">{v.v}</span> : <span className="text-[var(--syn-string)]">"{v.v.length > 60 ? v.v.slice(0, 60) + "…" : v.v}"</span>;
    case "num":
      return <span className="text-[var(--syn-number)]">{v.v}</span>;
    case "bool":
      return <span className="text-[var(--syn-keyword)]">{String(v.v)}</span>;
    case "null":
      return <span className="text-[var(--paper-3)]">null</span>;
    case "undef":
      return <span className="text-[var(--paper-3)]">undefined</span>;
    case "sym":
      return <span className="text-[var(--syn-control)]">{v.v}</span>;
    case "fn":
      return (
        <span>
          <span className="italic text-[var(--syn-keyword)]">ƒ</span> <span className="text-[var(--syn-fn)]">{v.v}</span>
          <span className="text-[var(--paper-3)]">()</span>
        </span>
      );
    case "err":
      return <span className="text-[var(--rose)]">{v.n}: {v.v}</span>;
    case "el":
      return <span className="text-[var(--syn-tag)]">{v.v}</span>;
    case "date":
      return <span className="text-[var(--syn-value)]">{v.v}</span>;
    case "re":
      return <span className="text-[var(--syn-tag)]">{v.v}</span>;
    case "circ":
      return <span className="text-[var(--paper-3)]">[circular]</span>;
    case "more":
      return <span className="text-[var(--paper-3)]">{v.v}</span>;
    case "arr":
      return (
        <span>
          <span className="text-[var(--paper-3)]">{v.c !== "Array" ? v.c : ""}({v.n}) </span>[
          {v.e.slice(0, 6).map((x, i) => (
            <span key={i}>
              {i > 0 && ", "}
              <Preview v={x} />
            </span>
          ))}
          {v.n > 6 && ", …"}]
        </span>
      );
    case "map":
      return (
        <span>
          <span className="text-[var(--paper-3)]">Map({v.n}) </span>
          {"{"}
          {v.e.slice(0, 4).map(([k, x], i) => (
            <span key={i}>
              {i > 0 && ", "}
              <Preview v={k} /> → <Preview v={x} />
            </span>
          ))}
          {v.n > 4 && ", …"}
          {"}"}
        </span>
      );
    case "obj":
      return (
        <span>
          {v.c !== "Object" && <span className="text-[var(--syn-type)]">{v.c} </span>}
          {"{"}
          {v.e.slice(0, 5).map(([k, x], i) => (
            <span key={k}>
              {i > 0 && ", "}
              <span className="text-[var(--syn-prop)]">{k}</span>: <Preview v={x} />
            </span>
          ))}
          {(v.e.length > 5 || v.x) && ", …"}
          {"}"}
        </span>
      );
  }
}

const expandable = (v: Ser) => (v.t === "obj" && v.e.length > 0) || (v.t === "arr" && v.e.length > 0) || (v.t === "map" && v.e.length > 0) || v.t === "err" || (v.t === "fn" && !!v.s);

function Value({ v, top, label }: { v: Ser; top?: boolean; label?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!expandable(v)) {
    return (
      <span>
        {label}
        <Preview v={v} top={top} />
      </span>
    );
  }
  return (
    <span className="inline-block max-w-full align-top">
      <button className="inline-flex items-start text-left hover:opacity-90" onClick={() => setOpen((o) => !o)}>
        <Icon name={open ? "arrow_drop_down" : "arrow_right"} size={16} className="-ml-1 mt-px text-[var(--paper-3)]" />
        <span>
          {label}
          <Preview v={v} />
        </span>
      </button>
      {open && (
        <span className="block border-l border-md-outline-v pl-3 ml-[3px]">
          {v.t === "obj" &&
            v.e.map(([k, x]) => (
              <span key={k} className="block">
                <Value v={x} label={<><span className="text-[var(--syn-prop)]">{k}</span>: </>} />
              </span>
            ))}
          {v.t === "arr" &&
            v.e.map((x, i) => (
              <span key={i} className="block">
                <Value v={x} label={<span className="text-[var(--paper-3)]">{i}: </span>} />
              </span>
            ))}
          {v.t === "map" &&
            v.e.map(([k, x], i) => (
              <span key={i} className="block">
                <Value v={x} label={<><Preview v={k} /> → </>} />
              </span>
            ))}
          {v.t === "err" && <span className="block whitespace-pre-wrap text-[var(--paper-3)]">{v.s}</span>}
          {v.t === "fn" && <span className="block whitespace-pre-wrap text-[var(--paper-2)]">{v.s}</span>}
        </span>
      )}
    </span>
  );
}

/* ---------------- painel ---------------- */

const LEVEL: Record<LogLevel, { icon: string; cls: string; row: string }> = {
  log: { icon: "", cls: "text-[var(--paper)]", row: "" },
  debug: { icon: "", cls: "text-[var(--paper-2)]", row: "" },
  info: { icon: "info", cls: "text-[var(--sky)]", row: "" },
  warn: { icon: "warning", cls: "text-[var(--amber)]", row: "bg-md-warn-c" },
  error: { icon: "error", cls: "text-[var(--rose)]", row: "bg-md-error-c" },
  result: { icon: "keyboard_return", cls: "text-[var(--paper-2)]", row: "" },
  input: { icon: "chevron_right", cls: "text-[var(--gold)]", row: "" },
  system: { icon: "info", cls: "text-[var(--paper-3)] italic", row: "" },
};

type Filter = "all" | "error" | "warn" | "log";

interface Props {
  logs: LogEntry[];
  onClear(): void;
  onEval(code: string): void;
  onJump(file: string, line: number, col: number): void;
  onClose(): void;
  knownFile(name: string): boolean;
}

export function ConsolePanel({ logs, onClear, onEval, onJump, onClose, knownFile }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [input, setInput] = useState("");
  const hist = useRef<string[]>([]);
  const hIdx = useRef(-1);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const counts = useMemo(() => {
    let e = 0,
      w = 0;
    for (const l of logs) {
      if (l.level === "error") e += l.count;
      else if (l.level === "warn") w += l.count;
    }
    return { e, w };
  }, [logs]);

  const shown = logs.filter((l) =>
    filter === "all" ? true : filter === "log" ? !["error", "warn"].includes(l.level) : l.level === filter
  );

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [logs.length, logs[logs.length - 1]?.count]);

  const submit = () => {
    const code = input.trim();
    if (!code) return;
    hist.current = [code, ...hist.current.filter((h) => h !== code)].slice(0, 50);
    hIdx.current = -1;
    setInput("");
    stick.current = true;
    onEval(code);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-md-outline-v pl-4 pr-2">
        <span className="md-title-s mr-2">Console</span>
        {(
          [
            ["all", "Tudo", null],
            ["error", "Erros", counts.e],
            ["warn", "Avisos", counts.w],
            ["log", "Logs", null],
          ] as const
        ).map(([k, label, n]) => (
          <button key={k} className="md-chip" data-on={filter === k} onClick={() => setFilter(k)}>
            {filter === k && <Icon name="check" size={16} />}
            {label}
            {!!n && (
              <span className={cn("rounded-full px-1.5 text-[10px] font-bold tabular-nums", k === "error" ? "bg-md-error text-md-surface" : "bg-md-warn text-md-surface")}>{n}</span>
            )}
          </button>
        ))}
        <div className="flex-1" />
        <IconButton icon="block" label="Limpar console" shortcut="Ctrl+L" size="sm" onClick={onClear} />
        <IconButton icon="keyboard_arrow_down" label="Esconder console" shortcut="Ctrl+J" size="sm" onClick={onClose} />
      </div>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        className="min-h-0 flex-1 select-text overflow-auto py-1 font-code text-[12px] leading-[1.6]"
      >
        {shown.length === 0 && (
          <div className="flex h-full items-center justify-center gap-2 text-[12px] text-[var(--paper-3)]" style={{ fontFamily: "var(--font-ui)" }}>
            <Icon name="terminal" size={16} /> Silêncio por enquanto. <span className="font-code text-[var(--paper-2)]">console.log()</span> aparece aqui.
          </div>
        )}
        {shown.map((l) => {
          const lv = LEVEL[l.level];
          const src = l.src && knownFile(l.src.file) ? l.src : null;
          return (
            <div key={l.id} className={cn("group mx-1.5 flex items-start gap-2 rounded-lg px-2.5 py-[3px]", lv.row)}>
              <span className="mt-[3px] flex w-4 shrink-0 justify-center">
                {lv.icon ? <Icon name={lv.icon} size={14} fill={l.level === "error" || l.level === "warn"} className={lv.cls} /> : null}
              </span>
              {l.count > 1 && (
                <span className="mt-[2px] shrink-0 rounded-full bg-md-highest px-1.5 text-[10px] font-semibold leading-[16px] text-[var(--paper-2)] tabular-nums">
                  {l.count}
                </span>
              )}
              <div className={cn("min-w-0 flex-1 break-words", lv.cls)}>
                {l.level === "input" ? (
                  <span className="whitespace-pre-wrap text-[var(--paper-2)]">{(l.args[0] as { v: string }).v}</span>
                ) : (
                  l.args.map((a, i) => (
                    <span key={i} className="mr-2 inline">
                      <Value v={a} top />
                    </span>
                  ))
                )}
              </div>
              {src && (
                <button
                  className="mt-[1px] shrink-0 text-[11px] text-[var(--paper-3)] underline-offset-2 hover:text-[var(--gold)] hover:underline"
                  onClick={() => onJump(src.file, src.line, src.col)}
                >
                  {src.file.split("/").pop()}:{src.line}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex shrink-0 items-start gap-2 border-t border-md-outline-v px-4 py-2">
        <Icon name="chevron_right" size={16} className="mt-[3px] text-[var(--gold)]" />
        <textarea
          value={input}
          rows={Math.min(6, input.split("\n").length)}
          spellCheck={false}
          placeholder="Avaliar JavaScript na página…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            } else if (e.key === "ArrowUp" && !input.includes("\n")) {
              const h = hist.current;
              if (!h.length) return;
              e.preventDefault();
              hIdx.current = Math.min(h.length - 1, hIdx.current + 1);
              setInput(h[hIdx.current]);
            } else if (e.key === "ArrowDown" && !input.includes("\n")) {
              e.preventDefault();
              hIdx.current = Math.max(-1, hIdx.current - 1);
              setInput(hIdx.current === -1 ? "" : hist.current[hIdx.current]);
            } else if (e.key.toLowerCase() === "l" && e.ctrlKey) {
              e.preventDefault();
              onClear();
            }
          }}
          className="min-h-[20px] flex-1 resize-none bg-transparent font-code text-[12px] leading-[1.6] text-[var(--paper)] outline-none placeholder:text-[var(--paper-3)]"
        />
      </div>
    </div>
  );
}
