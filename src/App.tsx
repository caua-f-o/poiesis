import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { zipSync } from "fflate";
import type { Device, Layout, LogEntry, PFile, Project, Settings, Workspace } from "@/lib/types";
import { loadWorkspace, newProject, saveWorkspace, isExtension, openPopout, pushPopout, freshWorkspace } from "@/lib/store";
import { buildPage } from "@/lib/build";
import { baseName, collectDrop, dataURLToBytes, download, findFile, fromInput, kindOf, makeFile, mimeOf, readIncoming, rootFolderName, uid, type Incoming } from "@/lib/files";
import { canFormat, formatCode } from "@/lib/format";
import { CodeEditor, type CursorInfo, type EditorHandle } from "@/editor/CodeEditor";
import { Split } from "@/components/Split";
import { TopBar } from "@/components/TopBar";
import { Explorer } from "@/components/Explorer";
import { EditorTabs } from "@/components/EditorTabs";
import { Preview, type PreviewHandle } from "@/components/Preview";
import { ConsolePanel } from "@/components/ConsolePanel";
import { StatusBar } from "@/components/StatusBar";
import { AssetView } from "@/components/AssetView";
import { CommandPalette, ImportDialog, SettingsDialog, type Cmd } from "@/components/Dialogs";
import { Icon, Logo } from "@/components/Icon";

const UI_KEY = "poiesis:ui";
const loadUi = () => {
  try {
    return { main: 50, stack: 52, cons: 68, ...JSON.parse(localStorage.getItem(UI_KEY) || "{}") };
  } catch {
    return { main: 50, stack: 52, cons: 68 };
  }
};

const STARTERS: Record<string, string> = {
  html: `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nova página</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>

</body>
</html>
`,
};

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "projeto";

let logSeq = 0;

export default function App() {
  const [ws, setWs] = useState<Workspace | null>(null);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [built, setBuilt] = useState<{ html: string; page: PFile | null; missing: string[] }>({ html: "", page: null, missing: [] });
  const [busy, setBusy] = useState(false);
  const [loadMs, setLoadMs] = useState<number | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [cursor, setCursor] = useState<CursorInfo | null>(null);
  const [previewPage, setPreviewPage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [pendingImport, setPendingImport] = useState<{ files: PFile[]; name: string } | null>(null);
  const [palette, setPalette] = useState<"files" | "all" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const [popout, setPopout] = useState(false);
  const [ui, setUi] = useState(loadUi);
  const [errorLine, setErrorLine] = useState<{ fileId: string; line: number; col: number; message: string } | null>(null);

  const editor = useRef<EditorHandle>(null);
  const preview = useRef<PreviewHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const wsRef = useRef(ws);
  wsRef.current = ws;

  /* ---------------- carregar / salvar ---------------- */
  useEffect(() => {
    loadWorkspace().then((w) => {
      setWs(w);
      const p = w.projects[w.currentId];
      setPreviewPage(p.activeFile && p.files.find((f) => f.id === p.activeFile)?.kind === "html" ? p.activeFile : p.entry);
    });
  }, []);

  useEffect(() => {
    if (!ws) return;
    setSaving("saving");
    const t = setTimeout(async () => {
      const ok = await saveWorkspace(ws);
      setSaving(ok ? "saved" : "error");
    }, 500);
    return () => clearTimeout(t);
  }, [ws]);

  useEffect(() => {
    localStorage.setItem(UI_KEY, JSON.stringify(ui));
  }, [ui]);

  const project: Project | null = ws ? ws.projects[ws.currentId] : null;
  const settings: Settings | null = ws?.settings ?? null;

  const updateProject = useCallback((fn: (p: Project) => Project, touch = true) => {
    setWs((w) => {
      if (!w) return w;
      const cur = w.projects[w.currentId];
      const next = fn(cur);
      if (next === cur) return w;
      return { ...w, projects: { ...w.projects, [cur.id]: touch ? { ...next, updatedAt: Date.now() } : next } };
    });
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setWs((w) => (w ? { ...w, settings: { ...w.settings, ...patch } } : w));
  }, []);

  /* ---------------- build do preview ---------------- */
  const runNow = useCallback(
    (hard = false) => {
      const w = wsRef.current;
      if (!w) return;
      const p = w.projects[w.currentId];
      const r = buildPage(p, previewPageRef.current, { console: true, autoInject: w.settings.autoInject });
      if (w.settings.clearOnRun) setLogs([]);
      setErrorLine(null);
      setBusy(true);
      setBuilt((b) => (b.html === r.html && !hard ? b : r));
      if (hard) setTimeout(() => preview.current?.reload(), 0);
      setTimeout(() => setBusy(false), 2500);
    },
    []
  );
  const previewPageRef = useRef(previewPage);
  previewPageRef.current = previewPage;

  const filesSig = project?.files;
  useEffect(() => {
    if (!ws || !settings) return;
    if (!settings.autoRun && built.html) return;
    const t = setTimeout(() => runNow(), built.html ? settings.delay : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesSig, previewPage, settings?.autoInject, settings?.autoRun, ws?.currentId]);

  useEffect(() => {
    if (popout && built.html) pushPopout(built.html, built.page?.name ?? "preview");
  }, [popout, built]);

  /* ---------------- mensagens do preview ---------------- */
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (!d || d.__poiesis !== 1) return;
      const w = wsRef.current;
      const p = w ? w.projects[w.currentId] : null;
      switch (d.type) {
        case "log": {
          const entry: LogEntry = { id: ++logSeq, level: d.level, args: d.args || [], src: d.src || undefined, count: 1, time: Date.now() };
          setLogs((ls) => {
            const last = ls[ls.length - 1];
            if (
              last &&
              last.level === entry.level &&
              last.src?.file === entry.src?.file &&
              last.src?.line === entry.src?.line &&
              JSON.stringify(last.args) === JSON.stringify(entry.args)
            ) {
              return [...ls.slice(0, -1), { ...last, count: last.count + 1 }];
            }
            const next = [...ls, entry];
            return next.length > 1500 ? next.slice(-1200) : next;
          });
          if (d.level === "error" && d.src && p) {
            const f = findFile(p.files, d.src.file);
            const a = d.args?.[0];
            const message = a?.t === "err" ? `${a.n}: ${a.v}` : a?.t === "str" ? a.v : "Erro";
            if (f) setErrorLine({ fileId: f.id, line: d.src.line, col: d.src.col, message });
          }
          break;
        }
        case "clear":
          setLogs([]);
          break;
        case "ready":
          setBusy(false);
          setLoadMs(d.ms ?? null);
          break;
        case "navigate": {
          if (!p || !d.path) break;
          const f = findFile(p.files, d.path);
          if (f && f.kind === "html") setPreviewPage(f.id);
          else toast.warning(`"${d.path}" não existe no projeto`);
          break;
        }
        case "open":
          if (typeof d.href === "string" && /^(https?:|mailto:)/.test(d.href)) window.open(d.href, "_blank", "noopener");
          break;
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  /* ---------------- arquivos ---------------- */
  const activeFile = project?.files.find((f) => f.id === project.activeFile) ?? null;
  const tabs = useMemo(
    () => (project ? project.openTabs.map((id) => project.files.find((f) => f.id === id)).filter(Boolean) as PFile[] : []),
    [project]
  );

  const openFile = useCallback(
    (id: string) => {
      updateProject(
        (p) => ({ ...p, activeFile: id, openTabs: p.openTabs.includes(id) ? p.openTabs : [...p.openTabs, id] }),
        false
      );
      const f = wsRef.current?.projects[wsRef.current.currentId].files.find((x) => x.id === id);
      if (f?.kind === "html") setPreviewPage(id);
    },
    [updateProject]
  );

  const closeTab = useCallback(
    (id: string) => {
      updateProject((p) => {
        const idx = p.openTabs.indexOf(id);
        const openTabs = p.openTabs.filter((x) => x !== id);
        const activeFile = p.activeFile === id ? (openTabs[idx] ?? openTabs[idx - 1] ?? null) : p.activeFile;
        return { ...p, openTabs, activeFile };
      }, false);
    },
    [updateProject]
  );

  const onChange = useCallback(
    (id: string, content: string) => {
      updateProject((p) => {
        const f = p.files.find((x) => x.id === id);
        if (!f || f.content === content) return p;
        return { ...p, files: p.files.map((x) => (x.id === id ? { ...x, content } : x)) };
      });
    },
    [updateProject]
  );

  const createFile = (name: string) => {
    if (!project) return;
    if (project.files.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
      toast.error(`Já existe "${name}"`);
      return;
    }
    const kind = kindOf(name);
    const f = makeFile(name, STARTERS[kind] ?? "");
    if (kind === "asset") {
      toast.error("Para imagens e mídias, use Importar");
      return;
    }
    updateProject((p) => ({ ...p, files: [...p.files, f], openTabs: [...p.openTabs, f.id], activeFile: f.id, entry: p.entry || f.id }));
    if (kind === "html") setPreviewPage(f.id);
  };

  const renameFile = (id: string, name: string) => {
    if (!project) return;
    if (project.files.some((f) => f.id !== id && f.name.toLowerCase() === name.toLowerCase())) {
      toast.error(`Já existe "${name}"`);
      return;
    }
    updateProject((p) => ({ ...p, files: p.files.map((f) => (f.id === id ? { ...f, name, kind: f.kind === "asset" ? "asset" : kindOf(name), mime: mimeOf(name) } : f)) }));
    toast(`Renomeado para ${baseName(name)}`, { description: "Lembre de atualizar as referências nos outros arquivos." });
  };

  const deleteFile = (id: string) => {
    if (!project) return;
    const snapshot = project;
    const f = project.files.find((x) => x.id === id);
    updateProject((p) => {
      const files = p.files.filter((x) => x.id !== id);
      const openTabs = p.openTabs.filter((x) => x !== id);
      return {
        ...p,
        files,
        openTabs,
        activeFile: p.activeFile === id ? (openTabs[0] ?? null) : p.activeFile,
        entry: p.entry === id ? (files.find((x) => x.kind === "html")?.id ?? "") : p.entry,
      };
    });
    toast(`"${f?.name}" excluído`, {
      action: { label: "Desfazer", onClick: () => updateProject((p) => (p.id === snapshot.id ? snapshot : p)) },
    });
  };

  const duplicateFile = (id: string) => {
    const f = project?.files.find((x) => x.id === id);
    if (!f || !project) return;
    const dot = f.name.lastIndexOf(".");
    let n = 1;
    let name = "";
    do {
      name = dot > 0 ? `${f.name.slice(0, dot)}-copia${n > 1 ? n : ""}${f.name.slice(dot)}` : `${f.name}-copia${n > 1 ? n : ""}`;
      n++;
    } while (project.files.some((x) => x.name === name));
    const copy = { ...f, id: uid(), name };
    updateProject((p) => ({ ...p, files: [...p.files, copy], openTabs: f.kind === "asset" ? p.openTabs : [...p.openTabs, copy.id], activeFile: copy.id }));
  };

  const downloadFile = (id: string) => {
    const f = project?.files.find((x) => x.id === id);
    if (!f) return;
    const data = f.kind === "asset" ? new Blob([dataURLToBytes(f.content) as BlobPart], { type: f.mime }) : new Blob([f.content], { type: f.mime });
    download(baseName(f.name), data);
  };

  /* ---------------- importação ---------------- */
  const receive = async (list: Incoming[]) => {
    if (!list.length) return;
    const t = toast.loading("Lendo arquivos…");
    try {
      const files = await readIncoming(list);
      toast.dismiss(t);
      if (!files.length) {
        toast.error("Nenhum arquivo utilizável");
        return;
      }
      const html = files.find((f) => baseName(f.name) === "index.html") ?? files.find((f) => f.kind === "html");
      const name = rootFolderName(list) ?? (html ? baseName(html.name).replace(/\.html?$/i, "") : "Importado");
      setPendingImport({ files, name: name === "index" ? "Importado" : name });
    } catch (e) {
      toast.dismiss(t);
      toast.error("Falha ao ler arquivos", { description: String(e) });
    }
  };

  const confirmImport = (mode: "new" | "merge", name: string) => {
    if (!pendingImport || !ws) return;
    const incoming = pendingImport.files;
    setPendingImport(null);
    const textFiles = incoming.filter((f) => f.kind !== "asset");
    const html = incoming.find((f) => baseName(f.name) === "index.html" && !f.name.includes("/")) ?? incoming.find((f) => f.kind === "html");
    const firstOpen = html ?? textFiles[0] ?? null;

    if (mode === "new") {
      const now = Date.now();
      const p: Project = {
        id: uid(),
        name,
        files: incoming,
        entry: html?.id ?? "",
        openTabs: textFiles.slice(0, 10).map((f) => f.id),
        activeFile: firstOpen?.id ?? null,
        createdAt: now,
        updatedAt: now,
      };
      setWs((w) => (w ? { ...w, projects: { ...w.projects, [p.id]: p }, order: [p.id, ...w.order], currentId: p.id } : w));
      setPreviewPage(html?.id ?? null);
      setLogs([]);
      toast.success(`Projeto "${name}" criado`, { description: `${incoming.length} arquivos importados` });
    } else {
      let entryId: string | null = null;
      let openId: string | null = null;
      updateProject((p) => {
        const files = [...p.files];
        const opened = [...p.openTabs];
        for (const f of incoming) {
          const i = files.findIndex((x) => x.name.toLowerCase() === f.name.toLowerCase());
          let id = f.id;
          if (i >= 0) {
            id = files[i].id;
            files[i] = { ...files[i], content: f.content, kind: f.kind, mime: f.mime };
          } else files.push(f);
          if (f.kind !== "asset" && !opened.includes(id) && opened.length < 14) opened.push(id);
          if (f === html) entryId = id;
          if (f === firstOpen) openId = id;
        }
        return { ...p, files, openTabs: opened, activeFile: openId ?? p.activeFile, entry: entryId ?? p.entry };
      });
      if (entryId) setPreviewPage(entryId);
      toast.success(`${incoming.length} arquivos mesclados`);
    }
  };

  /* ---------------- projetos ---------------- */
  const switchProject = (id: string) => {
    if (!ws || id === ws.currentId) return;
    const p = ws.projects[id];
    setWs({ ...ws, currentId: id });
    setPreviewPage(p.activeFile && p.files.find((f) => f.id === p.activeFile)?.kind === "html" ? p.activeFile : p.entry);
    setLogs([]);
  };

  const createProject = (template: string) => {
    const p = newProject(template);
    setWs((w) => (w ? { ...w, projects: { ...w.projects, [p.id]: p }, order: [p.id, ...w.order], currentId: p.id } : w));
    setPreviewPage(p.entry);
    setLogs([]);
  };

  const duplicateProject = () => {
    if (!project) return;
    const map = new Map<string, string>();
    const files = project.files.map((f) => {
      const id = uid();
      map.set(f.id, id);
      return { ...f, id };
    });
    const p: Project = {
      ...project,
      id: uid(),
      name: project.name + " (cópia)",
      files,
      entry: map.get(project.entry) ?? "",
      openTabs: project.openTabs.map((x) => map.get(x)!).filter(Boolean),
      activeFile: project.activeFile ? (map.get(project.activeFile) ?? null) : null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setWs((w) => (w ? { ...w, projects: { ...w.projects, [p.id]: p }, order: [p.id, ...w.order], currentId: p.id } : w));
    setPreviewPage(p.entry);
  };

  const deleteProject = () => {
    if (!ws || !project) return;
    const snapshot = ws;
    const order = ws.order.filter((x) => x !== project.id);
    let next: Workspace;
    if (!order.length) {
      const fresh = freshWorkspace();
      next = { ...fresh, settings: ws.settings };
    } else {
      const projects = { ...ws.projects };
      delete projects[project.id];
      next = { ...ws, projects, order, currentId: order[0] };
    }
    setWs(next);
    const np = next.projects[next.currentId];
    setPreviewPage(np.entry);
    toast(`Projeto "${project.name}" excluído`, {
      action: {
        label: "Desfazer",
        onClick: () => {
          setWs(snapshot);
          setPreviewPage(snapshot.projects[snapshot.currentId].entry);
        },
      },
      duration: 8000,
    });
  };

  /* ---------------- exportação ---------------- */
  const exportHtml = () => {
    if (!project || !settings) return;
    const r = buildPage(project, previewPage, { console: false, autoInject: settings.autoInject });
    const name = r.page ? baseName(r.page.name).replace(/\.html?$/i, "") : "index";
    download(`${slug(project.name)}${name !== "index" ? "-" + name : ""}.html`, new Blob([r.html], { type: "text/html" }));
  };

  const exportZip = () => {
    if (!project) return;
    const entries: Record<string, Uint8Array> = {};
    const enc = new TextEncoder();
    for (const f of project.files) entries[f.name] = f.kind === "asset" ? dataURLToBytes(f.content) : enc.encode(f.content);
    const zipped = zipSync(entries, { level: 6 });
    download(`${slug(project.name)}.zip`, new Blob([zipped as BlobPart], { type: "application/zip" }));
    toast.success("Projeto exportado", { description: `${project.files.length} arquivos em ${slug(project.name)}.zip` });
  };

  const backup = () => {
    if (!ws) return;
    const stamp = new Date().toISOString().slice(0, 10);
    download(`poiesis-backup-${stamp}.json`, new Blob([JSON.stringify(ws)], { type: "application/json" }));
  };

  const restore = async (file: File | undefined) => {
    if (!file || !ws) return;
    try {
      const data = JSON.parse(await file.text()) as Workspace;
      if (data.version !== 1 || !data.projects) throw new Error("formato inválido");
      const projects = { ...ws.projects };
      const order = [...ws.order];
      let added = 0;
      for (const id of data.order || Object.keys(data.projects)) {
        const p = data.projects[id];
        if (!p) continue;
        const nid = projects[id] ? uid() : id;
        projects[nid] = { ...p, id: nid };
        order.push(nid);
        added++;
      }
      setWs({ ...ws, projects, order });
      toast.success(`${added} projetos restaurados`);
    } catch (e) {
      toast.error("Backup inválido", { description: String(e) });
    }
  };

  /* ---------------- formatação ---------------- */
  const format = async () => {
    if (!activeFile || !settings || !canFormat(activeFile.kind)) return;
    setFormatting(true);
    try {
      const out = await formatCode(activeFile.content, activeFile.kind, settings.tabSize);
      onChange(activeFile.id, out);
    } catch (e) {
      const msg = String((e as Error)?.message || e).split("\n")[0];
      toast.error("Não deu pra formatar", { description: msg });
    } finally {
      setFormatting(false);
    }
  };

  /* ---------------- console ---------------- */
  const evalCode = (code: string) => {
    setLogs((ls) => [...ls, { id: ++logSeq, level: "input", args: [{ t: "str", v: code }], count: 1, time: Date.now() }]);
    preview.current?.eval(code);
  };

  const jumpTo = (file: string, line: number, col: number) => {
    if (!project) return;
    const f = findFile(project.files, file);
    if (!f) return;
    openFile(f.id);
    setTimeout(() => editor.current?.goto(line, col), 60);
  };

  const counts = useMemo(() => {
    let e = 0,
      w = 0;
    for (const l of logs) {
      if (l.level === "error") e += l.count;
      else if (l.level === "warn") w += l.count;
    }
    return { e, w };
  }, [logs]);

  /* ---------------- atalhos ---------------- */
  const layoutCycle: Layout[] = ["split", "stack", "editor", "preview"];
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    if (!settings) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    const inEditor = !!(e.target as HTMLElement | null)?.closest?.(".cm-editor");
    if (mod && !e.shiftKey && k === "p") {
      e.preventDefault();
      setPalette("files");
    } else if (mod && (k === "k" || (e.shiftKey && k === "p"))) {
      e.preventDefault();
      setPalette("all");
    } else if (mod && (k === "s" || k === "enter")) {
      e.preventDefault();
      if (!inEditor) runNow(true); // dentro do editor o próprio keymap executa
    } else if (mod && k === "b") {
      e.preventDefault();
      updateSettings({ sidebar: !settings.sidebar });
    } else if (mod && k === "j") {
      e.preventDefault();
      updateSettings({ console: !settings.console });
    } else if (mod && k === "r" && !e.shiftKey) {
      e.preventDefault();
      runNow(true);
    } else if (mod && k === "o") {
      e.preventDefault();
      fileInput.current?.click();
    } else if (mod && k === "\\") {
      e.preventDefault();
      updateSettings({ layout: layoutCycle[(layoutCycle.indexOf(settings.layout) + 1) % layoutCycle.length] });
    } else if (e.altKey && !mod && k === "z") {
      e.preventDefault();
      updateSettings({ wrap: !settings.wrap });
    } else if (e.altKey && e.shiftKey && k === "f") {
      e.preventDefault();
      format();
    } else if (e.key === "F2" && activeFile) {
      e.preventDefault();
      const n = prompt("Novo nome:", activeFile.name);
      if (n && n.trim() && n !== activeFile.name) renameFile(activeFile.id, n.trim());
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, []);

  /* ---------------- arrastar e soltar ---------------- */
  useEffect(() => {
    let depth = 0;
    const isFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types || []).includes("Files");
    const enter = (e: DragEvent) => {
      if (!isFiles(e)) return;
      depth++;
      setDropping(true);
    };
    const leave = (e: DragEvent) => {
      if (!isFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDropping(false);
    };
    const over = (e: DragEvent) => {
      if (isFiles(e)) e.preventDefault();
    };
    const drop = async (e: DragEvent) => {
      if (!isFiles(e) || !e.dataTransfer) return;
      e.preventDefault();
      depth = 0;
      setDropping(false);
      receiveRef.current(await collectDrop(e.dataTransfer));
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);
  const receiveRef = useRef(receive);
  receiveRef.current = receive;

  /* ---------------- comandos da paleta ---------------- */
  const commands: Cmd[] = settings
    ? [
        { id: "run", group: "Executar", label: "Executar agora", icon: "play_arrow", shortcut: "Ctrl ↵", run: () => runNow(true) },
        { id: "auto", group: "Executar", label: settings.autoRun ? "Desligar modo ao vivo" : "Ligar modo ao vivo", icon: "bolt", run: () => updateSettings({ autoRun: !settings.autoRun }) },
        { id: "fmt", group: "Editor", label: "Formatar documento", icon: "format_align_left", shortcut: "Shift Alt F", run: format },
        { id: "find", group: "Editor", label: "Buscar e substituir", icon: "search", shortcut: "Ctrl F", run: () => editor.current?.search() },
        { id: "wrap", group: "Editor", label: "Alternar quebra de linha", icon: "wrap_text", shortcut: "Alt Z", run: () => updateSettings({ wrap: !settings.wrap }) },
        { id: "comment", group: "Editor", label: "Comentar/descomentar linha", icon: "comment", shortcut: "Ctrl /", run: () => editor.current?.comment() },
        { id: "font+", group: "Editor", label: "Aumentar fonte", icon: "text_increase", run: () => updateSettings({ fontSize: Math.min(22, settings.fontSize + 1) }) },
        { id: "font-", group: "Editor", label: "Diminuir fonte", icon: "text_decrease", run: () => updateSettings({ fontSize: Math.max(10, settings.fontSize - 1) }) },
        { id: "sidebar", group: "Exibir", label: "Mostrar/esconder arquivos", icon: "left_panel_open", shortcut: "Ctrl B", run: () => updateSettings({ sidebar: !settings.sidebar }) },
        { id: "console", group: "Exibir", label: "Mostrar/esconder console", icon: "terminal", shortcut: "Ctrl J", run: () => updateSettings({ console: !settings.console }) },
        { id: "l-split", group: "Exibir", label: "Layout lado a lado", icon: "vertical_split", run: () => updateSettings({ layout: "split" }) },
        { id: "l-stack", group: "Exibir", label: "Layout empilhado", icon: "horizontal_split", run: () => updateSettings({ layout: "stack" }) },
        { id: "l-editor", group: "Exibir", label: "Só editor", icon: "code", run: () => updateSettings({ layout: "editor" }) },
        { id: "l-preview", group: "Exibir", label: "Só preview", icon: "visibility", run: () => updateSettings({ layout: "preview" }) },
        { id: "d-full", group: "Exibir", label: "Preview: tela cheia", icon: "desktop_windows", run: () => updateSettings({ device: "full" }) },
        { id: "d-tab", group: "Exibir", label: "Preview: tablet", icon: "tablet_mac", run: () => updateSettings({ device: "tablet" }) },
        { id: "d-mob", group: "Exibir", label: "Preview: celular", icon: "smartphone", run: () => updateSettings({ device: "mobile" }) },
        { id: "imp-f", group: "Projeto", label: "Importar arquivos", icon: "upload_file", shortcut: "Ctrl O", run: () => fileInput.current?.click() },
        { id: "imp-d", group: "Projeto", label: "Importar pasta", icon: "drive_folder_upload", run: () => folderInput.current?.click() },
        { id: "exp-z", group: "Projeto", label: "Exportar projeto (.zip)", icon: "folder_zip", run: exportZip },
        { id: "exp-h", group: "Projeto", label: "Exportar HTML único", icon: "html", run: exportHtml },
        { id: "new", group: "Projeto", label: "Novo projeto em branco", icon: "add", run: () => createProject("vazio") },
        { id: "clear", group: "Console", label: "Limpar console", icon: "block", run: () => setLogs([]) },
        { id: "prefs", group: "Geral", label: "Preferências", icon: "tune", run: () => setSettingsOpen(true) },
      ]
    : [];

  if (!ws || !project || !settings) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--ink-0)]">
        <Logo size={44} className="animate-pulse" />
      </div>
    );
  }

  const htmlPages = project.files.filter((f) => f.kind === "html");
  const showEditor = settings.layout !== "preview";
  const showPreview = settings.layout !== "editor";
  const dir = settings.layout === "stack" ? "col" : "row";

  const editorPane = (
    <div className="flex h-full flex-col bg-[var(--ink-2)]">
      <EditorTabs
        tabs={tabs}
        activeId={project.activeFile}
        sidebar={settings.sidebar}
        wrap={settings.wrap}
        canFormat={!!activeFile && canFormat(activeFile.kind)}
        formatting={formatting}
        onOpen={openFile}
        onClose={closeTab}
        onShowSidebar={() => updateSettings({ sidebar: true })}
        onFormat={format}
        onSearch={() => editor.current?.search()}
        onWrap={() => updateSettings({ wrap: !settings.wrap })}
      />
      <div className="relative min-h-0 flex-1">
        <div className={activeFile && activeFile.kind !== "asset" ? "h-full" : "hidden"}>
          <CodeEditor
            ref={editor}
            file={activeFile}
            settings={settings}
            errorLine={errorLine}
            onChange={onChange}
            onCursor={setCursor}
            onRun={() => runNow(true)}
          />
        </div>
        {activeFile?.kind === "asset" && (
          <AssetView
            file={activeFile}
            onCopy={(t, label) => {
              navigator.clipboard.writeText(t);
              toast.success(label);
            }}
          />
        )}
        {!activeFile && (
          <div className="flex h-full flex-col items-center justify-center gap-5 text-[var(--paper-3)]">
            <Logo size={56} className="opacity-40 grayscale-[.4]" />
            <div className="font-display text-[26px] italic text-[var(--paper-2)]">O que vem a ser?</div>
            <div className="grid gap-1.5 text-[12px]">
              {[
                ["Abrir arquivo", "Ctrl P"],
                ["Comandos", "Ctrl K"],
                ["Importar arquivos", "Ctrl O"],
                ["Executar", "Ctrl ↵"],
              ].map(([a, b]) => (
                <div key={a} className="flex w-56 items-center justify-between">
                  <span>{a}</span>
                  <span className="kbd">{b}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const previewPane = (
    <Split
      dir="col"
      size={ui.cons}
      onSize={(v) => setUi((u: typeof ui) => ({ ...u, cons: v }))}
      min={20}
      max={92}
      onDrag={setDragging}
      hide={settings.console ? null : "b"}
      a={
        <Preview
          ref={preview}
          html={built.html}
          page={built.page}
          pages={htmlPages}
          device={settings.device}
          landscape={settings.landscape}
          busy={busy}
          loadMs={loadMs}
          errors={counts.e}
          warns={counts.w}
          consoleOpen={settings.console}
          canPopout={isExtension()}
          dragging={dragging}
          onPage={(id) => setPreviewPage(id)}
          onDevice={(d: Device) => updateSettings({ device: d })}
          onLandscape={() => updateSettings({ landscape: !settings.landscape })}
          onPopout={() => {
            setPopout(true);
            pushPopout(built.html, built.page?.name ?? "preview");
            openPopout();
          }}
          onToggleConsole={() => updateSettings({ console: !settings.console })}
          onExportHtml={exportHtml}
        />
      }
      b={
        <ConsolePanel
          logs={logs}
          onClear={() => setLogs([])}
          onEval={evalCode}
          onJump={jumpTo}
          onClose={() => updateSettings({ console: false })}
          knownFile={(n) => !!findFile(project.files, n)}
        />
      }
    />
  );

  return (
    <div className="flex h-full flex-col">
      <TopBar
        project={project}
        projects={ws.order.map((id) => ws.projects[id])}
        autoRun={settings.autoRun}
        layout={settings.layout}
        onRun={() => runNow(true)}
        onAutoRun={() => updateSettings({ autoRun: !settings.autoRun })}
        onLayout={(l) => updateSettings({ layout: l })}
        onSwitch={switchProject}
        onNew={createProject}
        onRename={(name) => updateProject((p) => ({ ...p, name }))}
        onDuplicate={duplicateProject}
        onDelete={deleteProject}
        onImportFiles={() => fileInput.current?.click()}
        onImportFolder={() => folderInput.current?.click()}
        onExportHtml={exportHtml}
        onExportZip={exportZip}
        onPalette={() => setPalette("all")}
        onSettings={() => setSettingsOpen(true)}
      />

      <div className="flex min-h-0 flex-1">
        {settings.sidebar && (
          <aside className="w-[236px] shrink-0 border-r border-[var(--line)]">
            <Explorer
              projectName={project.name}
              files={project.files}
              activeId={project.activeFile}
              entryId={project.entry}
              onOpen={openFile}
              onCreate={createFile}
              onRename={renameFile}
              onDelete={deleteFile}
              onDuplicate={duplicateFile}
              onSetEntry={(id) => {
                updateProject((p) => ({ ...p, entry: id }));
                setPreviewPage(id);
              }}
              onDownload={downloadFile}
              onImportFiles={() => fileInput.current?.click()}
              onImportFolder={() => folderInput.current?.click()}
              onCollapse={() => updateSettings({ sidebar: false })}
            />
          </aside>
        )}
        <Split
          className="flex-1"
          dir={dir}
          size={dir === "row" ? ui.main : ui.stack}
          onSize={(v) => setUi((u: typeof ui) => (dir === "row" ? { ...u, main: v } : { ...u, stack: v }))}
          min={18}
          max={82}
          onDrag={setDragging}
          hide={!showEditor ? "a" : !showPreview ? "b" : null}
          a={editorPane}
          b={previewPane}
        />
      </div>

      <StatusBar
        file={activeFile}
        cursor={cursor}
        settings={settings}
        saving={saving}
        errors={counts.e}
        warns={counts.w}
        missing={built.missing}
        onConsole={() => updateSettings({ console: true })}
        onTab={() => updateSettings({ tabSize: settings.tabSize === 2 ? 4 : 2 })}
      />

      {/* entradas ocultas */}
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          receive(fromInput(e.target.files));
          e.target.value = "";
        }}
      />
      <input
        ref={folderInput}
        type="file"
        hidden
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(e) => {
          receive(fromInput(e.target.files));
          e.target.value = "";
        }}
      />
      <input
        ref={backupInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          restore(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {dropping && (
        <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-[var(--ink-0)]/80 backdrop-blur-sm">
          <div className="rise flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--gold)] px-14 py-10">
            <Icon name="move_to_inbox" size={40} className="text-[var(--gold)]" />
            <div className="font-display text-[28px] italic text-[var(--paper)]">Solte para dar forma</div>
            <div className="text-[12px] text-[var(--paper-3)]">HTML, CSS, JS, imagens ou uma pasta inteira</div>
          </div>
        </div>
      )}

      <ImportDialog
        files={pendingImport?.files ?? null}
        suggested={pendingImport?.name ?? ""}
        currentName={project.name}
        onCancel={() => setPendingImport(null)}
        onConfirm={confirmImport}
      />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onChange={updateSettings}
        onBackup={backup}
        onRestore={() => backupInput.current?.click()}
      />
      <CommandPalette
        open={!!palette}
        mode={palette ?? "all"}
        onOpenChange={(o) => !o && setPalette(null)}
        files={project.files}
        commands={commands}
        onOpenFile={openFile}
      />
      <Toaster
        theme="dark"
        position="bottom-right"
        offset={36}
        toastOptions={{
          style: {
            background: "#18181c",
            border: "1px solid #2c2c33",
            color: "#e8e4da",
            fontFamily: "var(--font-ui)",
            fontSize: 12.5,
          },
        }}
      />
    </div>
  );
}
