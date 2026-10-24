import { useMemo, useState } from "react";
import type { PFile } from "@/lib/types";
import { Icon } from "./Icon";
import { IconButton, PanelHeader } from "./md";
import { fileIcon } from "./fileIcon";
import { cn } from "@/lib/utils";
import { bytes, dirName } from "@/lib/files";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface TreeNode {
  name: string;
  path: string;
  dirs: TreeNode[];
  files: PFile[];
}

export function allFolders(files: PFile[], explicit: string[] = []) {
  const set = new Set<string>();
  const add = (p: string) => {
    const parts = p.split("/");
    for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join("/"));
  };
  for (const f of files) if (f.name.includes("/")) add(dirName(f.name));
  for (const d of explicit) if (d) add(d);
  return [...set].sort();
}

function buildTree(files: PFile[], folders: string[]): TreeNode {
  const root: TreeNode = { name: "", path: "", dirs: [], files: [] };
  const getDir = (path: string): TreeNode => {
    if (!path) return root;
    const parent = getDir(dirName(path));
    let n = parent.dirs.find((d) => d.path === path);
    if (!n) parent.dirs.push((n = { name: path.split("/").pop()!, path, dirs: [], files: [] }));
    return n;
  };
  for (const d of folders) getDir(d);
  for (const f of files) getDir(dirName(f.name)).files.push(f);
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

const DND = "application/x-poiesis";

interface Props {
  projectName: string;
  files: PFile[];
  folders: string[];
  activeId: string | null;
  entryId: string;
  onOpen(id: string): void;
  onCreate(name: string): void;
  onCreateFolder(path: string): void;
  onRename(id: string, name: string): void;
  onRenameFolder(from: string, to: string): void;
  onDelete(id: string): void;
  onDeleteFolder(path: string): void;
  onDuplicate(id: string): void;
  onSetEntry(id: string): void;
  onDownload(id: string): void;
  onMove(fileId: string, dir: string): void;
  onMoveFolder(path: string, dir: string): void;
  onAddFiles(dir: string): void;
  onAddFolder(dir: string): void;
  onDropExternal(dir: string, dt: DataTransfer): void;
  onCopy(text: string): void;
}

export function Explorer(p: Props) {
  const folders = useMemo(() => allFolders(p.files, p.folders), [p.files, p.folders]);
  const tree = useMemo(() => buildTree(p.files, folders), [p.files, folders]);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null); // id de arquivo ou "dir:caminho"
  const [creating, setCreating] = useState<{ dir: string; folder: boolean } | null>(null);
  const [draft, setDraft] = useState("");
  const [dropDir, setDropDir] = useState<string | null>(null);

  const total = useMemo(() => p.files.reduce((n, f) => n + f.content.length, 0), [p.files]);

  const open = (dir: string) => dir && setClosed((s) => (s.delete(dir) ? new Set(s) : s));

  const startCreate = (dir: string, folder: boolean) => {
    setCreating({ dir, folder });
    setDraft("");
    open(dir);
  };

  const commitCreate = () => {
    const name = draft.trim().replace(/^\/+|\/+$/g, "");
    if (name && creating) {
      const full = (creating.dir ? creating.dir + "/" : "") + name;
      if (creating.folder) p.onCreateFolder(full);
      else p.onCreate(full);
    }
    setCreating(null);
  };

  const commitRename = (f: PFile) => {
    const name = draft.trim().replace(/^\/+/, "");
    const dir = dirName(f.name);
    if (name && name !== f.name.split("/").pop()) p.onRename(f.id, name.includes("/") ? name : (dir ? dir + "/" : "") + name);
    setRenaming(null);
  };

  const commitRenameDir = (path: string) => {
    const name = draft.trim().replace(/^\/+|\/+$/g, "");
    const parent = dirName(path);
    if (name && name !== path.split("/").pop()) p.onRenameFolder(path, (parent ? parent + "/" : "") + name);
    setRenaming(null);
  };

  /* ---------- arrastar e soltar ---------- */
  const dropProps = (dir: string) => ({
    onDragOver: (e: React.DragEvent) => {
      const types = Array.from(e.dataTransfer.types);
      if (!types.includes(DND) && !types.includes("Files")) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = types.includes("Files") ? "copy" : "move";
      if (dropDir !== dir) setDropDir(dir);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDropDir((d) => (d === dir ? null : d));
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDropDir(null);
      const raw = e.dataTransfer.getData(DND);
      if (raw) {
        const d = JSON.parse(raw) as { t: "file" | "dir"; v: string };
        if (d.t === "file") p.onMove(d.v, dir);
        else if (d.v !== dir && !dir.startsWith(d.v + "/")) p.onMoveFolder(d.v, dir);
        return;
      }
      if (e.dataTransfer.types.includes("Files")) {
        open(dir);
        p.onDropExternal(dir, e.dataTransfer);
      }
    },
  });

  const dragProps = (t: "file" | "dir", v: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(DND, JSON.stringify({ t, v }));
      e.dataTransfer.effectAllowed = "move";
    },
  });

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
      className="md-field h-7 min-w-0 flex-1 rounded-md px-2 font-code text-[12px]"
    />
  );

  const moveTargets = (exclude?: string) => ["", ...folders].filter((d) => d !== exclude);

  const renderFile = (f: PFile, depth: number) => {
    const { icon, color } = fileIcon(f);
    const short = f.name.split("/").pop()!;
    const active = f.id === p.activeId;
    if (renaming === f.id) {
      return (
        <div key={f.id} className="flex h-8 items-center gap-2 pr-2" style={{ paddingLeft: 14 + depth * 14 }}>
          <span className="msr shrink-0" style={{ fontSize: 17, color }}>
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
            {...dragProps("file", f.id)}
            onClick={() => p.onOpen(f.id)}
            onDoubleClick={() => {
              setRenaming(f.id);
              setDraft(short);
            }}
            data-on={active}
            className="md-item h-8 pr-2"
            style={{ paddingLeft: 14 + depth * 14 }}
          >
            <span className="msr shrink-0" style={{ fontSize: 17, color }}>
              {icon}
            </span>
            <span className={cn("truncate font-code text-[12.5px]", active && "font-medium")}>{short}</span>
            {f.id === p.entryId && <Icon name="home" size={14} fill className="ml-auto text-md-primary" title="Página principal" />}
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-60">
          <ContextMenuItem onSelect={() => p.onOpen(f.id)}>
            <Icon name="open_in_browser" size={19} /> Abrir
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              setRenaming(f.id);
              setDraft(short);
            }}
          >
            <Icon name="edit" size={19} /> Renomear
            <ContextMenuShortcut>F2</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => p.onDuplicate(f.id)}>
            <Icon name="content_copy" size={19} /> Duplicar
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Icon name="drive_file_move" size={19} /> Mover para
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="max-h-72 w-52">
              {moveTargets(dirName(f.name)).map((d) => (
                <ContextMenuItem key={d || "/"} onSelect={() => p.onMove(f.id, d)} className="font-code text-[12px]">
                  <Icon name={d ? "folder" : "home_storage"} size={18} /> {d || "raiz do projeto"}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          {f.kind === "html" && f.id !== p.entryId && (
            <ContextMenuItem onSelect={() => p.onSetEntry(f.id)}>
              <Icon name="home" size={19} /> Definir como página principal
            </ContextMenuItem>
          )}
          <ContextMenuItem onSelect={() => p.onCopy(f.name)}>
            <Icon name="link" size={19} /> Copiar caminho
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => p.onDownload(f.id)}>
            <Icon name="download" size={19} /> Baixar arquivo
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem className="text-md-error [&_.msr]:!text-md-error" onSelect={() => p.onDelete(f.id)}>
            <Icon name="delete" size={19} /> Excluir
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  const creatingRow = (dir: string, depth: number) =>
    creating?.dir === dir ? (
      <div className="flex h-8 items-center gap-2 pr-2" style={{ paddingLeft: 14 + depth * 14 }}>
        <Icon name={creating.folder ? "create_new_folder" : "note_add"} size={17} className="text-md-primary" />
        {input(commitCreate, () => setCreating(null), creating.folder ? "nome-da-pasta" : "arquivo.css")}
      </div>
    ) : null;

  const renderDir = (d: TreeNode, depth: number): React.ReactNode => {
    const isClosed = closed.has(d.path);
    const isDrop = dropDir === d.path;
    return (
      <div key={d.path} {...dropProps(d.path)} className={cn("rounded-2xl transition-colors", isDrop && "bg-[color-mix(in_oklab,var(--md-primary)_12%,transparent)] outline outline-1 outline-md-primary")}>
        {renaming === "dir:" + d.path ? (
          <div className="flex h-8 items-center gap-2 pr-2" style={{ paddingLeft: 8 + depth * 14 }}>
            <Icon name="folder" size={17} fill className="text-md-primary" />
            {input(() => commitRenameDir(d.path), () => setRenaming(null), d.name)}
          </div>
        ) : (
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <button
                {...dragProps("dir", d.path)}
                onClick={() =>
                  setClosed((s) => {
                    const n = new Set(s);
                    if (n.has(d.path)) n.delete(d.path);
                    else n.add(d.path);
                    return n;
                  })
                }
                className="md-item h-8 gap-1 pr-2"
                style={{ paddingLeft: 6 + depth * 14 }}
              >
                <Icon name={isClosed ? "chevron_right" : "keyboard_arrow_down"} size={18} className="text-md-outline" />
                <Icon name={isClosed ? "folder" : "folder_open"} size={17} fill={isClosed} className="text-md-primary" />
                <span className="ml-1.5 truncate font-code text-[12.5px] text-md-on-surface">{d.name}</span>
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-60">
              <ContextMenuItem onSelect={() => startCreate(d.path, false)}>
                <Icon name="note_add" size={19} /> Novo arquivo aqui
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => startCreate(d.path, true)}>
                <Icon name="create_new_folder" size={19} /> Nova subpasta
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => p.onAddFiles(d.path)}>
                <Icon name="upload_file" size={19} /> Adicionar arquivos aqui
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => p.onAddFolder(d.path)}>
                <Icon name="drive_folder_upload" size={19} /> Adicionar pasta aqui
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                onSelect={() => {
                  setRenaming("dir:" + d.path);
                  setDraft(d.name);
                }}
              >
                <Icon name="edit" size={19} /> Renomear pasta
              </ContextMenuItem>
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <Icon name="drive_file_move" size={19} /> Mover para
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="max-h-72 w-52">
                  {moveTargets(dirName(d.path))
                    .filter((t) => t !== d.path && !t.startsWith(d.path + "/"))
                    .map((t) => (
                      <ContextMenuItem key={t || "/"} onSelect={() => p.onMoveFolder(d.path, t)} className="font-code text-[12px]">
                        <Icon name={t ? "folder" : "home_storage"} size={18} /> {t || "raiz do projeto"}
                      </ContextMenuItem>
                    ))}
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuItem onSelect={() => p.onCopy(d.path + "/")}>
                <Icon name="link" size={19} /> Copiar caminho
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem className="text-md-error [&_.msr]:!text-md-error" onSelect={() => p.onDeleteFolder(d.path)}>
                <Icon name="folder_delete" size={19} /> Excluir pasta
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        )}
        {!isClosed && (
          <div className="relative">
            <span className="absolute bottom-1 top-0 w-px bg-md-outline-v" style={{ left: 15 + depth * 14 }} />
            {creatingRow(d.path, depth + 1)}
            {d.dirs.map((x) => renderDir(x, depth + 1))}
            {d.files.map((f) => renderFile(f, depth + 1))}
            {!d.dirs.length && !d.files.length && creating?.dir !== d.path && (
              <div className="flex h-7 items-center text-[11.5px] italic text-md-outline" style={{ paddingLeft: 28 + depth * 14 }}>
                vazia — arraste arquivos para cá
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col" data-explorer>
      <PanelHeader title="Arquivos">
        <IconButton icon="note_add" label="Novo arquivo" size="sm" onClick={() => startCreate("", false)} />
        <IconButton icon="create_new_folder" label="Nova pasta" size="sm" onClick={() => startCreate("", true)} />
        <IconButton icon="upload_file" label="Adicionar arquivos" size="sm" onClick={() => p.onAddFiles("")} />
        <IconButton icon="drive_folder_upload" label="Adicionar pasta" size="sm" onClick={() => p.onAddFolder("")} />
      </PanelHeader>

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            {...dropProps("")}
            className={cn("min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-3", dropDir === "" && "bg-[color-mix(in_oklab,var(--md-primary)_6%,transparent)]")}
          >
            {creatingRow("", 0)}
            {tree.dirs.map((d) => renderDir(d, 0))}
            {tree.files.map((f) => renderFile(f, 0))}

            <div className="md-card-outlined mx-1 mt-4 border-dashed px-3 py-3 text-[11.5px] leading-relaxed text-md-on-variant">
              <Icon name="move_to_inbox" size={18} className="mb-1 block text-md-outline" />
              Arraste arquivos ou pastas para cá — ou para dentro de uma pasta. Arraste itens entre pastas para movê-los.
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuItem onSelect={() => startCreate("", false)}>
            <Icon name="note_add" size={19} /> Novo arquivo
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => startCreate("", true)}>
            <Icon name="create_new_folder" size={19} /> Nova pasta
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => p.onAddFiles("")}>
            <Icon name="upload_file" size={19} /> Adicionar arquivos
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => p.onAddFolder("")}>
            <Icon name="drive_folder_upload" size={19} /> Adicionar pasta
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <div className="flex h-9 shrink-0 items-center gap-2 border-t border-md-outline-v px-4 text-[11.5px] text-md-on-variant">
        <Icon name="inventory_2" size={15} />
        <span className="truncate">{p.projectName}</span>
        <span className="ml-auto shrink-0 tabular-nums">
          {p.files.length} · {bytes(total)}
        </span>
      </div>
    </div>
  );
}
