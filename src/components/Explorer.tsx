import { useMemo, useState } from "react";
import type { PFile } from "@/lib/types";
import { Icon } from "./Icon";
import { fileIcon } from "./fileIcon";
import { cn } from "@/lib/utils";
import { bytes, dirName } from "@/lib/files";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface TreeNode {
  name: string;
  path: string;
  dirs: TreeNode[];
  files: PFile[];
}

function buildTree(files: PFile[]): TreeNode {
  const root: TreeNode = { name: "", path: "", dirs: [], files: [] };
  for (const f of files) {
    const parts = f.name.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const path = parts.slice(0, i + 1).join("/");
      let next = node.dirs.find((d) => d.path === path);
      if (!next) {
        next = { name: parts[i], path, dirs: [], files: [] };
        node.dirs.push(next);
      }
      node = next;
    }
    node.files.push(f);
  }
  const sort = (n: TreeNode) => {
    n.dirs.sort((a, b) => a.name.localeCompare(b.name));
    n.files.sort((a, b) => {
      const an = a.name.split("/").pop()!;
      const bn = b.name.split("/").pop()!;
      if (an === "index.html") return -1;
      if (bn === "index.html") return 1;
      return an.localeCompare(bn);
    });
    n.dirs.forEach(sort);
  };
  sort(root);
  return root;
}

interface Props {
  projectName: string;
  files: PFile[];
  activeId: string | null;
  entryId: string;
  onOpen(id: string): void;
  onCreate(name: string): void;
  onRename(id: string, name: string): void;
  onDelete(id: string): void;
  onDuplicate(id: string): void;
  onSetEntry(id: string): void;
  onDownload(id: string): void;
  onImportFiles(): void;
  onImportFolder(): void;
  onCollapse(): void;
}

export function Explorer(p: Props) {
  const tree = useMemo(() => buildTree(p.files), [p.files]);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null); // diretório onde criar
  const [draft, setDraft] = useState("");

  const total = useMemo(() => p.files.reduce((n, f) => n + f.content.length, 0), [p.files]);

  const startCreate = (dir: string) => {
    setCreating(dir);
    setDraft("");
    if (dir) setClosed((s) => (s.delete(dir), new Set(s)));
  };

  const commitCreate = () => {
    const name = draft.trim().replace(/^\/+/, "");
    if (name && creating !== null) p.onCreate((creating ? creating + "/" : "") + name);
    setCreating(null);
  };

  const commitRename = (f: PFile) => {
    const name = draft.trim().replace(/^\/+/, "");
    const dir = dirName(f.name);
    if (name && name !== f.name.split("/").pop()) p.onRename(f.id, name.includes("/") ? name : (dir ? dir + "/" : "") + name);
    setRenaming(null);
  };

  const input = (onCommit: () => void, onCancel: () => void, placeholder: string) => (
    <input
      autoFocus
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit();
        if (e.key === "Escape") onCancel();
      }}
      onFocus={(e) => {
        const v = e.currentTarget.value;
        const dot = v.lastIndexOf(".");
        e.currentTarget.setSelectionRange(0, dot > 0 ? dot : v.length);
      }}
      className="h-[22px] min-w-0 flex-1 rounded-[4px] border border-[var(--gold-lo)] bg-[var(--ink-0)] px-1.5 font-code text-[12px] text-[var(--paper)] outline-none"
    />
  );

  const renderFile = (f: PFile, depth: number) => {
    const { icon, color } = fileIcon(f);
    const short = f.name.split("/").pop()!;
    const active = f.id === p.activeId;
    if (renaming === f.id) {
      return (
        <div key={f.id} className="flex h-[26px] items-center gap-1.5 pr-2" style={{ paddingLeft: 10 + depth * 12 }}>
          <span className="msr shrink-0" style={{ fontSize: 16, color }}>
            {icon}
          </span>
          {input(() => commitRename(f), () => setRenaming(null), short)}
        </div>
      );
    }
    return (
      <ContextMenu key={f.id}>
        <ContextMenuTrigger asChild>
          <button
            onClick={() => p.onOpen(f.id)}
            onDoubleClick={() => {
              setRenaming(f.id);
              setDraft(short);
            }}
            className={cn(
              "group relative flex h-[26px] w-full items-center gap-2 pr-2 text-left transition-colors",
              active ? "bg-[var(--ink-4)] text-[var(--paper)]" : "text-[var(--paper-2)] hover:bg-[var(--ink-3)] hover:text-[var(--paper)]"
            )}
            style={{ paddingLeft: 12 + depth * 12 }}
          >
            {active && <span className="absolute inset-y-1 left-0 w-[2px] rounded-full bg-[var(--gold)]" />}
            <span className="msr shrink-0" style={{ fontSize: 16, color }}>
              {icon}
            </span>
            <span className="truncate font-code text-[12px]">{short}</span>
            {f.id === p.entryId && (
              <span title="Página principal" className="ml-auto">
                <Icon name="home" size={13} fill className="text-[var(--gold-lo)]" />
              </span>
            )}
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuItem onSelect={() => p.onOpen(f.id)}>
            <Icon name="edit" size={16} className="mr-2" /> Abrir
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              setRenaming(f.id);
              setDraft(short);
            }}
          >
            <Icon name="drive_file_rename_outline" size={16} className="mr-2" /> Renomear
            <ContextMenuShortcut>F2</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => p.onDuplicate(f.id)}>
            <Icon name="content_copy" size={16} className="mr-2" /> Duplicar
          </ContextMenuItem>
          {f.kind === "html" && f.id !== p.entryId && (
            <ContextMenuItem onSelect={() => p.onSetEntry(f.id)}>
              <Icon name="home" size={16} className="mr-2" /> Definir como página principal
            </ContextMenuItem>
          )}
          <ContextMenuItem onSelect={() => p.onDownload(f.id)}>
            <Icon name="download" size={16} className="mr-2" /> Baixar arquivo
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem className="text-[var(--rose)] focus:text-[var(--rose)]" onSelect={() => p.onDelete(f.id)}>
            <Icon name="delete" size={16} className="mr-2" /> Excluir
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  const renderDir = (d: TreeNode, depth: number): React.ReactNode => {
    const isClosed = closed.has(d.path);
    return (
      <div key={d.path}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <button
              onClick={() =>
                setClosed((s) => {
                  const n = new Set(s);
                  if (n.has(d.path)) n.delete(d.path);
                  else n.add(d.path);
                  return n;
                })
              }
              className="flex h-[26px] w-full items-center gap-1 pr-2 text-left text-[var(--paper-2)] hover:bg-[var(--ink-3)] hover:text-[var(--paper)]"
              style={{ paddingLeft: 6 + depth * 12 }}
            >
              <Icon name={isClosed ? "chevron_right" : "keyboard_arrow_down"} size={16} className="text-[var(--paper-3)]" />
              <Icon name={isClosed ? "folder" : "folder_open"} size={16} fill={isClosed} className="text-[var(--gold-lo)]" />
              <span className="ml-1 truncate font-code text-[12px]">{d.name}</span>
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-52">
            <ContextMenuItem onSelect={() => startCreate(d.path)}>
              <Icon name="note_add" size={16} className="mr-2" /> Novo arquivo aqui
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        {!isClosed && (
          <div className="relative">
            <span className="absolute bottom-0 top-0 w-px bg-[var(--line)]" style={{ left: 13 + depth * 12 }} />
            {creating === d.path && (
              <div className="flex h-[26px] items-center gap-1.5 pr-2" style={{ paddingLeft: 12 + (depth + 1) * 12 }}>
                <Icon name="note_add" size={16} className="text-[var(--gold)]" />
                {input(commitCreate, () => setCreating(null), "arquivo.css")}
              </div>
            )}
            {d.dirs.map((x) => renderDir(x, depth + 1))}
            {d.files.map((f) => renderFile(f, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col bg-[var(--ink-1)]">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-[var(--line)] pl-3 pr-1.5">
        <span className="eyebrow flex-1">Arquivos</span>
        <button className="tool" title="Novo arquivo" onClick={() => startCreate("")}>
          <Icon name="note_add" size={17} />
        </button>
        <button className="tool" title="Importar arquivos" onClick={p.onImportFiles}>
          <Icon name="upload_file" size={17} />
        </button>
        <button className="tool" title="Importar pasta" onClick={p.onImportFolder}>
          <Icon name="drive_folder_upload" size={17} />
        </button>
        <button className="tool" title="Esconder barra lateral (Ctrl+B)" onClick={p.onCollapse}>
          <Icon name="left_panel_close" size={17} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-1.5">
        {creating === "" && (
          <div className="flex h-[26px] items-center gap-1.5 pl-3 pr-2">
            <Icon name="note_add" size={16} className="text-[var(--gold)]" />
            {input(commitCreate, () => setCreating(null), "nome.html, css/estilo.css…")}
          </div>
        )}
        {tree.dirs.map((d) => renderDir(d, 0))}
        {tree.files.map((f) => renderFile(f, 0))}

        <div className="mx-3 mt-4 rounded-lg border border-dashed border-[var(--line-2)] px-3 py-3 text-[11.5px] leading-relaxed text-[var(--paper-3)]">
          <Icon name="move_to_inbox" size={16} className="mb-1 block text-[var(--paper-3)]" />
          Arraste arquivos ou uma pasta inteira para cá. O HTML encontra seus <span className="font-code">.css</span> e{" "}
          <span className="font-code">.js</span> sozinho.
        </div>
      </div>

      <div className="flex h-8 shrink-0 items-center gap-2 border-t border-[var(--line)] px-3 text-[11px] text-[var(--paper-3)]">
        <Icon name="inventory_2" size={14} />
        <span className="truncate">{p.projectName}</span>
        <span className="ml-auto shrink-0 tabular-nums">
          {p.files.length} · {bytes(total)}
        </span>
      </div>
    </div>
  );
}
