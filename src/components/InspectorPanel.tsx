// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/* Painel "Elementos": árvore do DOM do preview, estilos aplicados, calculados, caixa e
 * edição temporária. Tudo vindo da página aparece como texto (React escapa). */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { BriefNode, Decl, MatchedRule, NodeInfo } from "@/lib/inspect";
import { changesToCss } from "@/lib/inspect";
import { Icon } from "./Icon";
import { IconButton, Tip } from "./md";
import { cn } from "@/lib/utils";

type Cmd = (c: Record<string, unknown>) => void;

export interface InspectorState {
  roots: BriefNode[];
  children: Record<number, BriefNode[]>;
  info: NodeInfo | null;
  found: { q: string; items: { id: number; label: string; text: string }[] } | null;
  picking: boolean;
  error: string | null;
}

export const emptyInspector = (): InspectorState => ({ roots: [], children: {}, info: null, found: null, picking: false, error: null });

const fmt = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");

/* ---------------- árvore ---------------- */

function NodeLabel({ n }: { n: BriefNode }) {
  if (n.type === "text") return <span className="text-md-on-surface">"{n.text}"</span>;
  if (n.type === "comment") return <span className="italic text-[var(--syn-comment)]">&lt;!-- {n.text} --&gt;</span>;
  return (
    <span>
      <span className="text-[var(--syn-punct)]">&lt;</span>
      <span className="text-[var(--syn-tag)]">{n.tag}</span>
      {(n.attrs ?? []).slice(0, 6).map(([k, v], i) => (
        <span key={i}>
          {" "}
          <span className="text-[var(--syn-attr)]">{k}</span>
          {v !== "" && (
            <>
              <span className="text-[var(--syn-punct)]">=</span>
              <span className="text-[var(--syn-string)]">"{v.length > 60 ? v.slice(0, 60) + "…" : v}"</span>
            </>
          )}
        </span>
      ))}
      {(n.attrs?.length ?? 0) > 6 && <span className="text-md-on-variant"> …</span>}
      <span className="text-[var(--syn-punct)]">&gt;</span>
      {n.dynamic && <span className="ml-1.5 rounded bg-md-high px-1 align-[1px] font-ui text-[9.5px] uppercase text-md-on-variant" title="Criado por script depois do carregamento: não existe no HTML-fonte">dinâmico</span>}
    </span>
  );
}

function Tree({ st, cmd, open, setOpen }: { st: InspectorState; cmd: Cmd; open: Set<number>; setOpen(s: Set<number>): void }) {
  const selId = st.info?.node.id;
  const rows: { n: BriefNode; depth: number }[] = [];
  const walk = (list: BriefNode[], depth: number) => {
    for (const n of list) {
      rows.push({ n, depth });
      if (n.type === "el" && open.has(n.id)) walk(st.children[n.id] ?? [], depth + 1);
    }
  };
  walk(st.roots, 0);
  const selRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // (scrollIntoView pode devolver uma Promise em Chromes recentes: não pode virar "cleanup")
    void selRef.current?.scrollIntoView({ block: "nearest" });
  }, [selId]);

  const toggle = (n: BriefNode) => {
    const next = new Set(open);
    if (next.has(n.id)) next.delete(n.id);
    else {
      next.add(n.id);
      if (!st.children[n.id]) cmd({ op: "children", id: n.id });
    }
    setOpen(next);
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    const r = rows[i];
    if (!r) return;
    const go = (j: number) => {
      const t = rows[j];
      if (t && t.n.type === "el") cmd({ op: "select", id: t.n.id });
      (e.currentTarget.parentElement?.children[j] as HTMLElement | undefined)?.focus();
    };
    if (e.key === "ArrowDown") (e.preventDefault(), go(Math.min(rows.length - 1, i + 1)));
    else if (e.key === "ArrowUp") (e.preventDefault(), go(Math.max(0, i - 1)));
    else if (e.key === "ArrowRight" && r.n.type === "el" && !open.has(r.n.id) && (r.n.count ?? 0) > 0) (e.preventDefault(), toggle(r.n));
    else if (e.key === "ArrowLeft" && open.has(r.n.id)) (e.preventDefault(), toggle(r.n));
  };
  return (
    <div role="tree" aria-label="Árvore do documento" className="py-1 font-code text-[12px]" onMouseLeave={() => cmd({ op: "hover", id: -1 })}>
      {rows.map(({ n, depth }, i) => {
        const isOpen = open.has(n.id);
        const sel = n.id === selId;
        return (
          <button
            key={n.id}
            ref={sel ? selRef : undefined}
            role="treeitem"
            aria-expanded={n.type === "el" && (n.count ?? 0) > 0 ? isOpen : undefined}
            aria-selected={sel}
            data-on={sel}
            tabIndex={sel || (i === 0 && !selId) ? 0 : -1}
            onKeyDown={(e) => onKey(e, i)}
            onMouseEnter={() => n.type === "el" && cmd({ op: "hover", id: n.id })}
            onClick={() => n.type === "el" && cmd({ op: "select", id: n.id })}
            className="md-item flex h-6 w-full items-center gap-0.5 rounded-none pr-2 text-left"
            style={{ paddingLeft: 6 + depth * 14 }}
          >
            {n.type === "el" && (n.count ?? 0) > 0 ? (
              <span
                role="presentation"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(n);
                }}
                className="flex h-4 w-4 shrink-0 items-center justify-center text-md-on-variant"
              >
                <Icon name={isOpen ? "keyboard_arrow_down" : "chevron_right"} size={15} />
              </span>
            ) : (
              <span className="w-4 shrink-0" />
            )}
            <span className="truncate">
              <NodeLabel n={n} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- estilos ---------------- */

/** Que declaração vence em cada propriedade (cascata simplificada: inline > regras por especificidade; !important vira). */
function winners(info: NodeInfo) {
  const win = new Map<string, { src: string; imp: boolean }>();
  const consider = (src: string, d: Decl) => {
    const cur = win.get(d[0]);
    if (!cur || (d[2] && !cur.imp)) win.set(d[0], { src, imp: d[2] });
  };
  info.inline.forEach((d) => consider("inline", d));
  info.rules.forEach((r) => r.decls.forEach((d) => consider(`r${r.id}`, d)));
  return win;
}

function EditableValue({ value, onCommit, label }: { value: string; onCommit(v: string): void; label: string }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(value);
  useEffect(() => {
    setV(value);
  }, [value]);
  if (!edit)
    return (
      <button className="min-w-0 truncate rounded px-0.5 text-left text-md-on-surface hover:bg-md-high" onClick={() => setEdit(true)} aria-label={`Editar ${label}`} title="Clique para editar (temporário)">
        {value}
      </button>
    );
  return (
    <input
      autoFocus
      value={v}
      spellCheck={false}
      aria-label={`Valor de ${label}`}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        setEdit(false);
        if (v !== value) onCommit(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
        if (e.key === "Escape") (setV(value), setEdit(false));
      }}
      className="h-5 min-w-0 flex-1 rounded border border-md-primary bg-transparent px-1 font-code text-[12px] text-md-on-surface outline-none"
    />
  );
}

function DeclRow({ d, overridden, disabled, onToggle, onValue }: { d: Decl; overridden: boolean; disabled?: boolean; onToggle?(on: boolean): void; onValue(v: string): void }) {
  return (
    <div className={cn("group flex items-center gap-1.5 py-[1px] pl-4 pr-2", (overridden || disabled) && "opacity-55")}>
      {onToggle ? (
        <input type="checkbox" className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100" checked={!disabled} onChange={(e) => onToggle(e.target.checked)} aria-label={`Ligar/desligar ${d[0]}`} />
      ) : (
        <span className="w-3 shrink-0" />
      )}
      <span className={cn("shrink-0 text-[var(--syn-prop)]", (overridden || disabled) && "line-through")}>{d[0]}</span>
      <span className="text-[var(--syn-punct)]">:</span>
      <EditableValue value={d[1]} label={d[0]} onCommit={onValue} />
      {d[2] && <span className="shrink-0 text-[var(--syn-keyword)]">!important</span>}
    </div>
  );
}

function AddProp({ onAdd }: { onAdd(prop: string, value: string): void }) {
  const [p, setP] = useState("");
  const [v, setV] = useState("");
  const ok = /^(--[\w-]+|-?[a-z][a-z-]*)$/.test(p.trim());
  const add = () => {
    if (!ok) return;
    onAdd(p.trim(), v);
    setP("");
    setV("");
  };
  return (
    <div className="flex items-center gap-1 py-1 pl-8 pr-2">
      <input value={p} onChange={(e) => setP(e.target.value)} placeholder="propriedade" aria-label="Nova propriedade" spellCheck={false} className="h-6 w-28 rounded border border-md-outline-v bg-transparent px-1 font-code text-[11.5px] outline-none focus:border-md-primary" />
      <span className="text-[var(--syn-punct)]">:</span>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        placeholder="valor"
        aria-label="Valor da nova propriedade"
        spellCheck={false}
        className="h-6 min-w-0 flex-1 rounded border border-md-outline-v bg-transparent px-1 font-code text-[11.5px] outline-none focus:border-md-primary"
      />
      <IconButton icon="add" label="Adicionar ao estilo do elemento" size="sm" disabled={!ok} onClick={add} />
    </div>
  );
}

function Styles({ info, cmd, onOpenRule }: { info: NodeInfo; cmd: Cmd; onOpenRule(r: MatchedRule): void }) {
  const win = useMemo(() => winners(info), [info]);
  const id = info.node.id;
  const states = ["hover", "focus", "active", "focus-visible", "focus-within"];
  return (
    <div className="pb-4 font-code text-[12px]">
      <div className="flex flex-wrap items-center gap-1 border-b border-md-outline-v px-3 py-1.5 font-ui text-[11.5px] text-md-on-variant">
        Forçar estado:
        {states.map((s) => (
          <button key={s} className="md-chip h-6 px-2 text-[11px]" data-on={info.forced.includes(s)} onClick={() => cmd({ op: "state", id, state: s, on: !info.forced.includes(s) })}>
            :{s}
          </button>
        ))}
      </div>
      <div className="border-b border-md-outline-v py-1.5">
        <div className="px-3 pb-0.5 text-md-on-variant">
          <span className="text-[var(--syn-keyword)]">elemento</span>.style {"{"}
        </div>
        {info.inline.map((d) => (
          <DeclRow key={d[0]} d={d} overridden={win.get(d[0])?.src !== "inline"} onValue={(v) => cmd({ op: "inline", id, prop: d[0], value: v, important: d[2] })} />
        ))}
        <AddProp onAdd={(prop, value) => cmd({ op: "inline", id, prop, value })} />
        <div className="px-3 text-md-on-variant">{"}"}</div>
      </div>
      {info.rules.map((r) => (
        <div key={r.id} className="border-b border-md-outline-v py-1.5">
          {r.ctx.map((c, i) => (
            <div key={i} className="px-3 text-[11px] text-[var(--syn-keyword)]">
              {c}
            </div>
          ))}
          <div className="flex items-baseline gap-2 px-3 pb-0.5">
            <span className="min-w-0 break-all text-[var(--syn-tag)]">{r.selector}</span>
            <span className="text-md-on-variant">{"{"}</span>
            <span className="ml-auto shrink-0 font-ui text-[10.5px] text-md-on-variant" title="Especificidade (ids, classes, tipos) — aproximada">
              {r.spec.join(",")}
            </span>
            {r.file && (
              <button className="shrink-0 font-ui text-[11px] text-md-primary underline-offset-2 hover:underline" onClick={() => onOpenRule(r)} title="Abrir a regra no código">
                {r.file.split("/").pop()}
              </button>
            )}
          </div>
          {r.decls.map((d) => (
            <DeclRow
              key={d[0]}
              d={d}
              overridden={win.get(d[0])?.src !== `r${r.id}`}
              onToggle={(on) => cmd({ op: "rule", id, rule: r.id, prop: d[0], enabled: on })}
              onValue={(v) => cmd({ op: "rule", id, rule: r.id, prop: d[0], value: v })}
            />
          ))}
          {r.disabled.map((p) => (
            <DeclRow key={"off-" + p} d={[p, "(desligado)", false]} overridden={false} disabled onToggle={(on) => cmd({ op: "rule", id, rule: r.id, prop: p, enabled: on })} onValue={() => undefined} />
          ))}
          <div className="px-3 text-md-on-variant">{"}"}</div>
        </div>
      ))}
      {!info.rules.length && <div className="px-3 py-3 font-ui text-[12px] text-md-on-variant">Nenhuma regra CSS se aplica a este elemento.</div>}
      {info.skippedSheets > 0 && (
        <div className="px-3 py-2 font-ui text-[11.5px] text-md-on-variant">
          {info.skippedSheets} folha(s) de estilo de outro site (CDN) não podem ser lidas pela página: as regras delas não aparecem aqui, mas valem no "Calculado".
        </div>
      )}
    </div>
  );
}

function Computed({ info, onAll }: { info: NodeInfo; onAll(): void }) {
  const [q, setQ] = useState("");
  const list = info.computed.filter(([k, v]) => !q || k.includes(q.toLowerCase()) || v.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="pb-4 font-code text-[12px]">
      <div className="flex items-center gap-2 border-b border-md-outline-v px-3 py-1.5">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar propriedade" aria-label="Filtrar propriedades calculadas" className="h-7 min-w-0 flex-1 rounded-full bg-md-high px-3 font-ui text-[12px] outline-none" />
        {info.computed.length < 100 && (
          <button className="md-btn md-btn-text h-7 px-2 font-ui text-[12px]" onClick={onAll}>
            Mostrar todas
          </button>
        )}
      </div>
      {info.vars.length > 0 && (
        <>
          <div className="eyebrow px-3 pt-2 font-ui">Variáveis CSS usadas</div>
          {info.vars.map(([k, v]) => (
            <div key={k} className="flex gap-2 px-3 py-[1px]">
              <span className="shrink-0 text-[var(--syn-prop)]">{k}</span>
              <span className="min-w-0 break-all text-md-on-surface">{v}</span>
            </div>
          ))}
          <div className="eyebrow px-3 pt-2 font-ui">Propriedades</div>
        </>
      )}
      {list.map(([k, v]) => (
        <div key={k} className="flex gap-2 px-3 py-[1px]">
          <span className="w-44 shrink-0 text-[var(--syn-prop)]">{k}</span>
          <span className="min-w-0 break-all text-md-on-surface">
            {/^(rgb|#)/.test(v) && <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border border-md-outline-v align-[-1px]" style={{ background: /^(rgba?\([\d.,\s%]+\)|#[0-9a-f]{3,8})$/i.test(v) ? v : undefined }} />}
            {v}
          </span>
        </div>
      ))}
    </div>
  );
}

function BoxModel({ info }: { info: NodeInfo }) {
  const b = info.box;
  const ring = (label: string, vals: number[], cls: string, child: ReactNode) => (
    <div className={cn("relative rounded-md border border-dashed px-7 py-5 text-center", cls)}>
      <span className="absolute left-1.5 top-0.5 text-[10px] text-md-on-variant">{label}</span>
      <span className="absolute left-1/2 top-0.5 -translate-x-1/2">{fmt(vals[0])}</span>
      <span className="absolute right-1.5 top-1/2 -translate-y-1/2">{fmt(vals[1])}</span>
      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2">{fmt(vals[2])}</span>
      <span className="absolute left-1.5 top-1/2 -translate-y-1/2">{fmt(vals[3])}</span>
      {child}
    </div>
  );
  const cw = b.w - b.border[1] - b.border[3] - b.padding[1] - b.padding[3];
  const ch = b.h - b.border[0] - b.border[2] - b.padding[0] - b.padding[2];
  return (
    <div className="flex flex-col items-center gap-3 p-4 font-code text-[11.5px]">
      {ring(
        "margin",
        b.margin,
        "border-[rgba(246,178,107,.8)] bg-[rgba(246,178,107,.12)]",
        ring(
          "border",
          b.border,
          "border-[rgba(255,229,153,.8)] bg-[rgba(255,229,153,.12)]",
          ring("padding", b.padding, "border-[rgba(147,196,125,.8)] bg-[rgba(147,196,125,.12)]", <div className="rounded bg-[rgba(111,168,220,.3)] px-4 py-2">{`${fmt(Math.max(0, cw))} × ${fmt(Math.max(0, ch))}`}</div>)
        )
      )}
      <div className="font-ui text-[11.5px] text-md-on-variant">
        Posição na tela: {fmt(b.x)}, {fmt(b.y)} · tamanho total {fmt(b.w)} × {fmt(b.h)}
      </div>
    </div>
  );
}

/* ---------------- painel ---------------- */

type Tab = "estilos" | "calculado" | "caixa" | "atributos";

export function InspectorPanel({
  title,
  st,
  cmd,
  onClose,
  onGotoSource,
  onOpenRule,
  onCopy,
  onDiscard,
}: {
  title: ReactNode;
  st: InspectorState;
  cmd: Cmd;
  onClose(): void;
  onGotoSource(info: NodeInfo): void;
  onOpenRule(r: MatchedRule): void;
  onCopy(text: string): void;
  onDiscard(): void;
}) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [tab, setTab] = useState<Tab>("estilos");
  const [q, setQ] = useState("");
  const info = st.info;

  // ao selecionar, abre os ancestrais na árvore (pedindo os filhos que faltam)
  useEffect(() => {
    if (!info) return;
    const next = new Set(open);
    let changed = false;
    for (const a of info.ancestors.slice(0, -1)) {
      if (!next.has(a.id)) {
        next.add(a.id);
        changed = true;
      }
      if (!st.children[a.id]) cmd({ op: "children", id: a.id });
    }
    if (changed) setOpen(next);
  }, [info?.node.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!st.roots.length) cmd({ op: "root" });
  }, [st.roots.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full flex-col" data-pz="inspector">
      <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-md-outline-v pl-3 pr-2">
        {title}
        <Tip label={st.picking ? "Cancelar seleção (Esc)" : "Selecionar elemento no preview"} shortcut="Ctrl+Shift+C">
          <button className="md-btn md-btn-tonal h-7 shrink-0 gap-1 px-2.5 text-[12px]" data-on={st.picking} onClick={() => cmd({ op: st.picking ? "stop" : "pick" })} aria-label="Selecionar elemento no preview" aria-pressed={st.picking}>
            <Icon name="arrow_selector_tool" size={16} /> {st.picking ? "Escolha na página…" : "Selecionar"}
          </button>
        </Tip>
        <div className="flex min-w-0 flex-1 items-center">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              cmd({ op: "find", q: e.target.value });
            }}
            placeholder="Buscar tag, #id, .classe ou texto"
            aria-label="Buscar elementos"
            className="h-7 w-full max-w-64 rounded-full bg-md-high px-3 text-[12px] text-md-on-surface outline-none placeholder:text-md-on-variant"
          />
        </div>
        {!!info?.changes.length && (
          <>
            <Tip label="Copiar as mudanças como CSS">
              <button className="md-btn md-btn-text h-7 shrink-0 px-2 text-[12px]" onClick={() => onCopy(changesToCss(info.changes))}>
                <Icon name="content_copy" size={15} /> {info.changes.length}
              </button>
            </Tip>
            <IconButton icon="restart_alt" label="Descartar mudanças temporárias (recarrega o preview)" size="sm" onClick={onDiscard} />
          </>
        )}
        <IconButton icon="refresh" label="Atualizar árvore" size="sm" onClick={() => cmd({ op: "root", reselect: true })} />
        <IconButton icon="keyboard_arrow_down" label="Esconder painel" shortcut="Ctrl+J" size="sm" onClick={onClose} />
      </div>
      {st.error && <div className="border-b border-md-outline-v px-3 py-1.5 text-[12px] text-[var(--amber)]">{st.error}</div>}
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 w-[44%] overflow-auto border-r border-md-outline-v">
          {q && st.found ? (
            <div className="py-1 font-code text-[12px]">
              {!st.found.items.length && <div className="px-3 py-3 font-ui text-md-on-variant">Nada encontrado.</div>}
              {st.found.items.map((it) => (
                <button key={it.id} className="md-item flex h-7 w-full gap-2 rounded-none px-3 text-left" onMouseEnter={() => cmd({ op: "hover", id: it.id })} onClick={() => (cmd({ op: "select", id: it.id }), setQ(""))}>
                  <span className="shrink-0 text-[var(--syn-tag)]">{it.label}</span>
                  <span className="truncate text-md-on-variant">{it.text}</span>
                </button>
              ))}
            </div>
          ) : (
            <Tree st={st} cmd={cmd} open={open} setOpen={setOpen} />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col" data-pz="inspector-detail">
          {!info ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center text-[12px] text-md-on-variant">
              <Icon name="arrow_selector_tool" size={22} />
              Clique em "Selecionar" e escolha um elemento no preview, ou navegue pela árvore.
            </div>
          ) : (
            <>
              <div className="no-scrollbar flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-md-outline-v px-2 py-1 font-code text-[11px]">
                {info.ancestors.map((a, i) => (
                  <span key={a.id} className="flex shrink-0 items-center">
                    {i > 0 && <Icon name="chevron_right" size={13} className="text-md-outline" />}
                    <button className={cn("rounded px-1 hover:bg-md-high", a.id === info.node.id ? "text-md-on-surface" : "text-md-on-variant")} onClick={() => cmd({ op: "select", id: a.id })} onMouseEnter={() => cmd({ op: "hover", id: a.id })}>
                      {a.label}
                    </button>
                  </span>
                ))}
              </div>
              <div className="no-scrollbar flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-md-outline-v px-2">
                {(
                  [
                    ["estilos", "Estilos"],
                    ["calculado", "Calculado"],
                    ["caixa", "Caixa"],
                    ["atributos", "Atributos"],
                  ] as const
                ).map(([k, label]) => (
                  <button key={k} data-on={tab === k} onClick={() => setTab(k)} className="md-chip h-7 text-[12px]">
                    {label}
                  </button>
                ))}
                <div className="flex-1" />
                <button
                  className="md-btn md-btn-text h-7 shrink-0 px-2 text-[12px]"
                  disabled={!info.path}
                  title={info.path ? "Abrir este elemento no HTML" : "Criado por script: não existe no HTML-fonte"}
                  onClick={() => onGotoSource(info)}
                >
                  <Icon name="code" size={16} /> Ver no código
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {tab === "estilos" && <Styles info={info} cmd={cmd} onOpenRule={onOpenRule} />}
                {tab === "calculado" && <Computed info={info} onAll={() => cmd({ op: "computed", id: info.node.id })} />}
                {tab === "caixa" && <BoxModel info={info} />}
                {tab === "atributos" && (
                  <div className="p-3 font-code text-[12px]">
                    {(info.node.attrs ?? []).map(([k, v]) => (
                      <div key={k} className="flex gap-2 py-[1px]">
                        <span className="shrink-0 text-[var(--syn-attr)]">{k}</span>
                        <span className="min-w-0 break-all text-[var(--syn-string)]">{v}</span>
                      </div>
                    ))}
                    {!info.node.attrs?.length && <div className="font-ui text-md-on-variant">Sem atributos.</div>}
                    {info.text && (
                      <>
                        <div className="eyebrow pt-3 font-ui">Texto</div>
                        <div className="whitespace-pre-wrap break-words text-md-on-surface">{info.text}</div>
                      </>
                    )}
                    {info.node.dynamic && <div className="pt-3 font-ui text-[12px] text-md-on-variant">Este elemento foi criado por script depois do carregamento: não há posição correspondente no HTML-fonte.</div>}
                  </div>
                )}
              </div>
              {!!info.changes.length && (
                <div className="shrink-0 border-t border-md-outline-v px-3 py-1.5 text-[11.5px] text-md-on-variant">
                  {info.changes.length} mudança(s) temporária(s) no preview — somem ao recarregar. Use copiar para levar ao código.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
