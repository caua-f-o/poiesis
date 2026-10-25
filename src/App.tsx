// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { zipSync } from "fflate";
import type { Device, Layout, LogEntry, Panel, PFile, Project, Settings, Workspace } from "@/lib/types";
import { parsePreviewMessage, SESSION } from "@/lib/bridge";
import { loadWorkspace, newProject, saveWorkspace, isExtension, openPopout, pushPopout, freshWorkspace } from "@/lib/store";
import { buildPage, type ExtPreview } from "@/lib/build";
import {
  baseName,
  collectDrop,
  dataURLToBytes,
  download,
  findFile,
  fromInput,
  kindOf,
  makeFile,
  mimeOf,
  readIncoming,
  rootFolderName,
  uid,
  type Incoming,
} from "@/lib/files";
import { canFormat, formatCode } from "@/lib/format";
import { applyTheme, themeById } from "@/lib/themes";
import { buildIndex, setIndex, type Loc } from "@/lib/indexer";
import { CodeEditor, type CursorInfo, type EditorHandle } from "@/editor/CodeEditor";
import type { Sym } from "@/editor/definition";
import { Split } from "@/components/Split";
import { NavRail } from "@/components/NavRail";
import { TopAppBar } from "@/components/TopAppBar";
import { Explorer, allFolders } from "@/components/Explorer";
import { SearchPanel } from "@/components/SearchPanel";
import { ProjectsPanel, ThemesPanel } from "@/components/SidePanels";
import { CompareDialog, HistoryPanel } from "@/components/HistoryPanel";
import { createSnapshot, deleteOrphans, exportHistory, importHistory, prune, restoreProject, type Reason, type Revision } from "@/lib/history";
import { dbErrorMessage } from "@/lib/db";
import { useFolderSync } from "@/lib/useFolderSync";
import { folderSupported } from "@/lib/localfs";
import { EditorTabs } from "@/components/EditorTabs";
import { EditorContextMenu, symLabel } from "@/components/EditorContextMenu";
import { Preview, type PreviewHandle } from "@/components/Preview";
import { ConsolePanel } from "@/components/ConsolePanel";
import { MocksDialog, NetworkPanel, RequestDialog, type NetRequest } from "@/components/NetworkPanel";
import { InspectorPanel, emptyInspector, type InspectorState } from "@/components/InspectorPanel";
import { applyChanges, changesToCss, pathToSource, ruleInCss, sourceToPath, type MatchedRule, type NodeInfo, type PathStep, type TempChange } from "@/lib/inspect";
import { MOCKS_FILE, NET_LIMITS, maskBody, parseMocks, stringifyMocks, toHar, type MockRule, type MocksConfig, type NetEntry } from "@/lib/net";
import { StatusBar } from "@/components/StatusBar";
import { Companion } from "@/components/Companion";
import { MusicButton } from "@/components/MusicButton";
import { useCompanion } from "@/lib/companion";
import { useFocusMusic } from "@/lib/useFocusMusic";
import { ExtensionPanel } from "@/components/ExtensionPanel";
import { ManifestForm } from "@/components/ManifestForm";
import { ExportExtensionDialog, IconsDialog, NewExtensionDialog } from "@/components/ExtensionDialogs";
import { ChromeSimDialog } from "@/components/ChromeSimDialog";
import { MANIFEST, editManifest, isExtensionProject, jsonRange, pageRole, parseManifest, setAt, type JPath } from "@/lib/ext/manifest";
import { applyFix, validateExtension, type ExtFix, type ExtProblem } from "@/lib/ext/validate";
import { extensionZipFiles } from "@/lib/ext/map";
import { extensionProject, type ExtOptions } from "@/lib/ext/templates";
import { API_PERMISSION } from "@/lib/ext/permissions";
import { CHROME_FILE, parseChromeFixtures, stringifyChromeFixtures, type ChromeFixtures } from "@/lib/ext/fixtures";
import { AssetView } from "@/components/AssetView";
import { MarkdownView, isMarkdown } from "@/components/MarkdownView";
import { SymbolPicker, type SymbolPick } from "@/components/SymbolPicker";
import { hasSymbolsLink, linkTag, withSymbolsLink } from "@/lib/symbols";
import { CommandPalette, ImportDialog, RenameDialog, SettingsDialog, ShortcutsDialog, type Cmd, type ImportMode } from "@/components/Dialogs";
import { Icon, Logo } from "@/components/Icon";
import { installRipple } from "@/components/md";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const UI_KEY = "poiesis:ui";
const loadUi = () => {
  try {
    return { main: 50, stack: 52, cons: 68, bottom: "console", netPreserve: false, ...JSON.parse(localStorage.getItem(UI_KEY) || "{}") };
  } catch {
    return { main: 50, stack: 52, cons: 68, bottom: "console", netPreserve: false };
  }
};

/** Regras de mock ativas do projeto (arquivo poiesis.mocks.json). */
function activeMocks(p: Project): MockRule[] {
  const f = p.files.find((x) => x.name === MOCKS_FILE);
  if (!f) return [];
  const { config } = parseMocks(f.content);
  return config.enabled ? config.mocks.filter((m) => m.enabled) : [];
}

type ExtStore = { local?: Record<string, unknown>; sync?: Record<string, unknown> };

/** Opções do preview para projetos de extensão (APIs chrome.* simuladas). */
function extPreview(p: Project, pageId: string | null, device: Device, storage: ExtStore | undefined): ExtPreview | undefined {
  if (!isExtensionProject(p.files)) return undefined;
  const mf = p.files.find((f) => f.name === MANIFEST)!;
  const m = parseManifest(mf.content).data ?? {};
  const page = p.files.find((f) => f.id === pageId && f.kind === "html") ?? p.files.find((f) => f.id === p.entry && f.kind === "html") ?? p.files.find((f) => f.kind === "html");
  const role = page ? pageRole(m, page.name) : null;
  let messages: Record<string, unknown> = {};
  if (typeof m.default_locale === "string") {
    const lf = p.files.find((f) => f.name === `_locales/${m.default_locale}/messages.json`);
    try {
      if (lf) messages = JSON.parse(lf.content);
    } catch {
      /* JSON inválido: o validador avisa */
    }
  }
  const fx = p.files.find((f) => f.name === CHROME_FILE);
  const fixtures = fx ? parseChromeFixtures(fx.content).config : null;
  return {
    manifest: m,
    view: role === "popup" && device !== "full" ? null : role,
    // sem estado guardado no preview, o chrome.storage começa com o da fixture
    storage: storage ?? fixtures?.storage ?? {},
    messages,
    apiPerms: API_PERMISSION,
    fixtures: fixtures ? { tabs: fixtures.tabs, messages: fixtures.messages } : undefined,
  };
}

const STARTERS: Record<string, string> = {
  json: "{\n  \"nome\": \"valor\"\n}\n",
  md: "# Título\n\nEscreva aqui. **Negrito**, *itálico*, [links](https://developer.mozilla.org) e listas:\n\n- um\n- dois\n",
  txt: "",
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

/** "style.css" → "style-2.css" até não colidir */
function uniqueName(name: string, taken: Set<string>) {
  if (!taken.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf(".");
  const slash = name.lastIndexOf("/");
  const hasExt = dot > slash + 1;
  const stem = hasExt ? name.slice(0, dot) : name;
  const ext = hasExt ? name.slice(dot) : "";
  for (let n = 2; ; n++) {
    const c = `${stem}-${n}${ext}`;
    if (!taken.has(c.toLowerCase())) return c;
  }
}

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
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [mdMode, setMdMode] = useState<"code" | "split" | "view">(() => (localStorage.getItem("poiesis:md-mode") as "code" | "split" | "view") || "split");
  const [symbolPicker, setSymbolPicker] = useState<{ lang: "html" | "css" | "js" | "other"; current: { from: number; to: number; name: string; style: string } | null } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ sym: Sym; label: string; name: string; count: number } | null>(null);
  /** muda a cada revisão gravada (o painel de histórico recarrega) */
  const [historyTick, setHistoryTick] = useState(0);
  const [compareRev, setCompareRev] = useState<Revision | null>(null);
  const historyInput = useRef<HTMLInputElement>(null);
  /** registro de rede por projeto — só em memória, nunca persistido */
  const [netLogs, setNetLogs] = useState<Record<string, NetEntry[]>>({});
  const [reqDialog, setReqDialog] = useState<{ open: boolean; prefill?: NetRequest }>({ open: false });
  const [mocksOpen, setMocksOpen] = useState(false);
  /* Extension Studio */
  const [extNew, setExtNew] = useState(false);
  const [iconsOpen, setIconsOpen] = useState(false);
  const [extExport, setExtExport] = useState(false);
  const [manifestMode, setManifestMode] = useState<"form" | "json">(() => (localStorage.getItem("poiesis:manifest-mode") === "json" ? "json" : "form"));
  const [extSize, setExtSize] = useState<{ w: number; h: number } | null>(null);
  const [chromeOpen, setChromeOpen] = useState(false);
  /** chrome.storage simulado do preview, por projeto */
  const extStorage = useRef<Record<string, ExtStore>>(
    (() => {
      try {
        return JSON.parse(localStorage.getItem("poiesis:ext-storage") || "{}");
      } catch {
        return {};
      }
    })()
  );
  const saveExtSoon = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastExtCp = useRef(0);
  const [insp, setInsp] = useState<InspectorState>(emptyInspector);
  /** caminho do elemento selecionado, para reselecionar depois que o preview recarrega */
  const inspPath = useRef<PathStep[] | null>(null);
  const uiBottomRef = useRef("console");
  const netQueue = useRef<[string, NetEntry][]>([]);
  const netFlush = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchSeed, setSearchSeed] = useState<{ q: string; n: number } | null>(null);
  const [formatting, setFormatting] = useState(false);
  const [popout, setPopout] = useState(false);
  const [ui, setUi] = useState(loadUi);
  const [errorLine, setErrorLine] = useState<{ fileId: string; line: number; col: number; message: string } | null>(null);

  const editor = useRef<EditorHandle>(null);
  const preview = useRef<PreviewHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  /** pasta de destino quando a importação vem de "Adicionar aqui" (pula o diálogo) */
  const importDir = useRef<string | null>(null);
  const wsRef = useRef(ws);
  wsRef.current = ws;
  /** localStorage do preview, por projeto (a sandbox não tem armazenamento próprio) */
  const previewStorage = useRef<Record<string, Record<string, string>>>(
    (() => {
      try {
        return JSON.parse(localStorage.getItem("poiesis:preview-storage") || "{}");
      } catch {
        return {};
      }
    })()
  );
  const saveStorageSoon = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => installRipple(), []);

  /* ---------------- carregar / salvar ---------------- */
  useEffect(() => {
    loadWorkspace().then(({ ws: w, migrated, error }) => {
      setWs(w);
      const p = w.projects[w.currentId];
      setPreviewPage(p.activeFile && p.files.find((f) => f.id === p.activeFile)?.kind === "html" ? p.activeFile : p.entry);
      if (migrated) toast.success("Projetos migrados para o novo armazenamento local", { description: "Mais rápido e pronto para o histórico de versões." });
      if (error) toast.error("Banco local indisponível — usando o armazenamento antigo", { description: error, duration: 10000 });
    });
  }, []);

  const saveError = useRef<string | null>(null);
  useEffect(() => {
    if (!ws) return;
    setSaving("saving");
    const t = setTimeout(async () => {
      const r = await saveWorkspace(ws);
      setSaving(r.ok ? "saved" : "error");
      if (!r.ok && r.error !== saveError.current) toast.error("Não foi possível salvar", { description: r.error, duration: 10000 });
      saveError.current = r.ok ? null : (r.error ?? null);
    }, 500);
    return () => clearTimeout(t);
  }, [ws]);

  useEffect(() => {
    localStorage.setItem(UI_KEY, JSON.stringify(ui));
  }, [ui]);

  const project: Project | null = ws ? ws.projects[ws.currentId] : null;
  const settings: Settings | null = ws?.settings ?? null;
  const theme = themeById(settings?.theme ?? "tinta");

  /* ---------------- companheiro e música de foco ---------------- */
  const comp = useCompanion(settings?.companionLevel ?? "discreto", !!settings && settings.companion !== "nenhum");
  const emitRef = useRef(comp.emit);
  emitRef.current = comp.emit;
  const music = useFocusMusic(settings?.musicVolume ?? 0.45, settings?.musicAutoPause ?? true);
  useEffect(() => emitRef.current(music.state === "playing" ? "focus:on" : "focus:off"), [music.state]);
  const [pageHidden, setPageHidden] = useState(false);
  useEffect(() => {
    const on = () => setPageHidden(document.hidden);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  /** estatística da execução atual, para o companheiro comemorar só quando faz sentido */
  const runStats = useRef({ errors: 0, prevErrors: 0, manual: false, seq: 0 });
  const userRun = useRef(false);

  useEffect(() => {
    if (settings) applyTheme(themeById(settings.theme));
  }, [settings?.theme]); // eslint-disable-line react-hooks/exhaustive-deps

  // índice do projeto (autocompletar cruzado, definições)
  useEffect(() => {
    if (!project) return;
    const t = setTimeout(() => setIndex(project.files), 250);
    return () => clearTimeout(t);
  }, [project?.files]); // eslint-disable-line react-hooks/exhaustive-deps

  /** projeto ligado a uma pasta sem acesso: edição bloqueada (ver useFolderSync) */
  const readOnlyRef = useRef<(id: string | undefined) => boolean>(() => false);
  const roWarned = useRef(0);
  const updateProject = useCallback((fn: (p: Project) => Project, touch = true) => {
    if (touch && readOnlyRef.current(wsRef.current?.currentId)) {
      if (Date.now() - roWarned.current > 4000) {
        roWarned.current = Date.now();
        toast.warning("Projeto somente leitura", { description: "A pasta do computador está sem acesso. Reconecte ou desvincule para editar." });
      }
      return;
    }
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

  /* ---------------- histórico local ---------------- */
  /** Grava uma versão do projeto (por padrão o atual). Não bloqueia a interface. */
  const checkpoint = useCallback((reason: Reason, p?: Project | null, opts?: { label?: string; note?: string }) => {
    const w = wsRef.current;
    const target = p ?? (w ? w.projects[w.currentId] : null);
    if (!target) return Promise.resolve(null);
    const hs = w?.settings.history;
    return createSnapshot(target, reason, { ...opts, maxFileSize: hs?.maxFileSize })
      .then(async (rev) => {
        setHistoryTick((t) => t + 1);
        if (reason === "auto" && hs) await prune(target.id, hs.maxAuto).catch(() => 0);
        return rev;
      })
      .catch((e) => {
        toast.error("Não foi possível gravar a versão no histórico", { description: dbErrorMessage(e), duration: 10000 });
        return null;
      });
  }, []);

  // snapshot automático depois de um tempo sem editar
  const autoTimer = useRef<{ t: ReturnType<typeof setTimeout>; project: Project } | null>(null);
  const flushAuto = useCallback(() => {
    const a = autoTimer.current;
    if (!a) return;
    clearTimeout(a.t);
    autoTimer.current = null;
    checkpoint("auto", a.project);
  }, [checkpoint]);
  useEffect(() => {
    const p = project;
    const secs = settings?.history.interval ?? 0;
    if (!p || !secs) return;
    // trocou de projeto com versão pendente: grava a do projeto anterior agora
    if (autoTimer.current && autoTimer.current.project.id !== p.id) flushAuto();
    if (autoTimer.current) clearTimeout(autoTimer.current.t);
    autoTimer.current = { project: p, t: setTimeout(() => flushAuto(), secs * 1000) };
  }, [project?.files, project?.folders]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && flushAuto();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flushAuto);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flushAuto);
    };
  }, [flushAuto]);

  /* ---------------- pasta do computador ---------------- */
  const [linkAsk, setLinkAsk] = useState<string | null>(null);
  const decideRef = useRef<((v: "write" | "read" | null) => void) | null>(null);
  const folder = useFolderSync({
    enabled: !!settings?.localFolders && folderSupported(),
    ignore: settings?.folderIgnore ?? "",
    project,
    updateProject,
    checkpoint,
    onConflict: (rev) => setCompareRev(rev),
    notify: (kind, title, description) => toast[kind](title, { description, duration: kind === "warning" || kind === "error" ? 10000 : 4000 }),
  });
  readOnlyRef.current = folder.isReadOnly;
  const folderStatus = project ? folder.status[project.id] : undefined;

  // vínculos de projetos que não existem mais (excluídos em outra sessão) saem
  useEffect(() => {
    if (!ws || !folder.loaded) return;
    for (const id of Object.keys(folder.status)) if (!ws.projects[id]) folder.unlink(id);
  }, [folder.loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const folderError = (title: string) => (e: unknown) => toast.error(title, { description: (e as Error)?.message || String(e) });

  const openLocalFolder = async () => {
    const t = toast.loading("Lendo a pasta…");
    try {
      const p = await folder.openFolder();
      toast.dismiss(t);
      if (!p) return;
      setWs((w) => (w ? { ...w, projects: { ...w.projects, [p.id]: p }, order: [p.id, ...w.order], currentId: p.id } : w));
      checkpoint("import", p, { label: `Pasta ${p.name}` });
      setPreviewPage(p.entry || null);
      setLogs([]);
      toast.success(`Pasta "${p.name}" aberta`, { description: `${p.files.length} arquivos. O que você editar aqui é gravado direto nela.` });
    } catch (e) {
      toast.dismiss(t);
      folderError("Não foi possível abrir a pasta")(e);
    }
  };

  const linkCurrentFolder = async () => {
    if (!project) return;
    try {
      const ok = await folder.linkProject(
        project,
        (name) =>
          new Promise((res) => {
            decideRef.current = res;
            setLinkAsk(name);
          })
      );
      if (ok) toast.success("Projeto vinculado à pasta", { description: "As edições agora vão direto para os arquivos do computador." });
    } catch (e) {
      folderError("Não foi possível vincular a pasta")(e);
    }
  };

  const unlinkFolder = async () => {
    if (!project) return;
    await folder.unlink(project.id);
    toast("Projeto desvinculado da pasta", { description: "Os arquivos continuam no computador; o projeto segue salvo no navegador." });
  };

  /* ---------------- build do preview ---------------- */
  const previewPageRef = useRef(previewPage);
  previewPageRef.current = previewPage;

  const uiRef = useRef(ui);
  uiRef.current = ui;
  const runNow = useCallback((hard = false) => {
    const w = wsRef.current;
    if (!w) return;
    const p = w.projects[w.currentId];
    const ext = extPreview(p, previewPageRef.current, w.settings.device, extStorage.current[p.id]);
    // numa extensão cada página carrega os próprios scripts: injetar os "soltos" misturaria popup, opções e service worker
    const r = buildPage(p, previewPageRef.current, { console: true, autoInject: w.settings.autoInject && !ext, storage: previewStorage.current[p.id], session: SESSION, mocks: activeMocks(p), ext });
    runStats.current = { errors: 0, prevErrors: runStats.current.errors, manual: userRun.current, seq: runStats.current.seq + 1 };
    userRun.current = false;
    if (w.settings.clearOnRun) setLogs([]);
    if (!uiRef.current.netPreserve) setNetLogs((m) => (m[p.id]?.length ? { ...m, [p.id]: [] } : m));
    setErrorLine(null);
    setBusy(true);
    setBuilt((b) => (b.html === r.html && !hard ? b : r));
    if (hard) setTimeout(() => preview.current?.reload(), 0);
    setTimeout(() => setBusy(false), 2500);
  }, []);

  const runUser = useCallback(() => {
    userRun.current = true;
    runNow(true);
  }, [runNow]);

  const filesSig = project?.files;
  useEffect(() => {
    if (!ws || !settings) return;
    if (!settings.autoRun && built.html) return;
    const t = setTimeout(() => runNow(), built.html ? settings.delay : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesSig, previewPage, settings?.autoInject, settings?.autoRun, settings?.device, ws?.currentId]);

  useEffect(() => {
    if (popout && built.html) pushPopout(built.html, built.page?.name ?? "preview");
  }, [popout, built]);

  /* ---------------- mensagens do preview ---------------- */
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      // só aceita mensagens vindas do iframe sandbox do preview (que repassa as da página do usuário)
      const src = preview.current?.source();
      if (!src || e.source !== src) return;
      // e só no formato esperado: versão, sessão deste editor, tipo e campos conferidos
      const d = parsePreviewMessage(e.data);
      if (!d) return;
      const w = wsRef.current;
      const p = w ? w.projects[w.currentId] : null;
      switch (d.type) {
        case "log": {
          const entry: LogEntry = { id: ++logSeq, level: d.level, args: d.args || [], src: d.src || undefined, count: 1, time: Date.now() };
          setLogs((ls) => {
            const last = ls[ls.length - 1];
            if (last && last.level === entry.level && last.src?.file === entry.src?.file && last.src?.line === entry.src?.line && JSON.stringify(last.args) === JSON.stringify(entry.args)) {
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
          if (d.level === "error") {
            runStats.current.errors++;
            const a0 = d.args?.[0];
            emitRef.current("preview:error", a0?.t === "err" ? `${a0.n}: ${a0.v}` : a0?.t === "str" ? a0.v : "erro");
          }
          break;
        }
        case "clear":
          setLogs([]);
          break;
        case "storage": {
          if (!p || typeof d.data !== "object") break;
          previewStorage.current[p.id] = d.data;
          if (saveStorageSoon.current) clearTimeout(saveStorageSoon.current);
          saveStorageSoon.current = setTimeout(() => {
            try {
              localStorage.setItem("poiesis:preview-storage", JSON.stringify(previewStorage.current));
            } catch {
              /* cheio: ignora */
            }
          }, 400);
          break;
        }
        case "net": {
          if (!p) break;
          // junta as mensagens e aplica em lote (uma página que dispara milhares de requisições não trava o editor)
          netQueue.current.push([p.id, d.entry]);
          if (!netFlush.current)
            netFlush.current = setTimeout(() => {
              netFlush.current = null;
              const batch = netQueue.current.splice(0);
              setNetLogs((m) => {
                const out = { ...m };
                for (const [pid, e] of batch) {
                  const list = out[pid] ?? [];
                  const i = list.findIndex((x) => x.id === e.id && x.kind === e.kind);
                  out[pid] = i >= 0 ? list.map((x, j) => (j === i ? e : x)) : [...list, e];
                }
                for (const pid of Object.keys(out)) if (out[pid].length > NET_LIMITS.entries) out[pid] = out[pid].slice(-NET_LIMITS.entries);
                return out;
              });
            }, 80);
          break;
        }
        case "inspect": {
          const m = d.msg;
          if (m.ev === "children") setInsp((st) => (m.data.id === 0 ? { ...st, roots: m.data.nodes, children: {} } : { ...st, children: { ...st.children, [m.data.id]: m.data.nodes } }));
          else if (m.ev === "node") {
            inspPath.current = m.data.path;
            setInsp((st) => ({ ...st, info: m.data, picking: false, error: null }));
            if (uiBottomRef.current !== "elements") setUi((u: typeof ui) => ({ ...u, bottom: "elements" }));
          } else if (m.ev === "found") setInsp((st) => ({ ...st, found: m.data }));
          else if (m.ev === "stopped") setInsp((st) => ({ ...st, picking: false }));
          else if (m.ev === "error") setInsp((st) => ({ ...st, error: m.data.message || "Erro no inspetor", picking: false }));
          break;
        }
        case "ready":
          // preview recarregou: árvore nova; reseleciona o mesmo elemento se der
          setInsp((st) => ({ ...emptyInspector(), info: null, error: st.info && !inspPath.current ? "O elemento selecionado era dinâmico e não pôde ser reencontrado." : null }));
          if (uiBottomRef.current === "elements") {
            preview.current?.inspect({ op: "root" });
            if (inspPath.current) preview.current?.inspect({ op: "byPath", path: inspPath.current });
          }
          setBusy(false);
          setLoadMs(d.ms ?? null);
          {
            // sucesso: sem erros pouco depois de carregar, numa execução pedida ou que resolveu erros
            const seq = runStats.current.seq;
            setTimeout(() => {
              const rs = runStats.current;
              if (rs.seq === seq && rs.errors === 0 && (rs.manual || rs.prevErrors > 0)) emitRef.current("preview:success");
            }, 1200);
          }
          break;
        case "ext-storage": {
          if (!p) break;
          extStorage.current[p.id] = { ...(extStorage.current[p.id] ?? {}), [d.area]: d.data };
          if (saveExtSoon.current) clearTimeout(saveExtSoon.current);
          saveExtSoon.current = setTimeout(() => {
            try {
              localStorage.setItem("poiesis:ext-storage", JSON.stringify(extStorage.current));
            } catch {
              /* cheio: fica só na memória */
            }
          }, 400);
          break;
        }
        case "ext-size":
          setExtSize({ w: d.w, h: d.h });
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
  const tabs = useMemo(() => (project ? (project.openTabs.map((id) => project.files.find((f) => f.id === id)).filter(Boolean) as PFile[]) : []), [project]);
  const folders = useMemo(() => (project ? allFolders(project.files, project.folders) : []), [project]);

  const openFile = useCallback(
    (id: string) => {
      if (wsRef.current?.projects[wsRef.current.currentId].activeFile !== id) emitRef.current("file:opened");
      updateProject((p) => ({ ...p, activeFile: id, openTabs: p.openTabs.includes(id) ? p.openTabs : [...p.openTabs, id] }), false);
      const f = wsRef.current?.projects[wsRef.current.currentId].files.find((x) => x.id === id);
      if (f?.kind === "html") setPreviewPage(id);
    },
    [updateProject]
  );

  const jumpTo = useCallback(
    (fileId: string, line: number, col: number) => {
      openFile(fileId);
      setTimeout(() => editor.current?.goto(line, col), 60);
    },
    [openFile]
  );
  const jumpLoc = useCallback((l: Loc) => jumpTo(l.fileId, l.line, l.col), [jumpTo]);

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
      emitRef.current("editor:typing");
      updateProject((p) => {
        const f = p.files.find((x) => x.id === id);
        if (!f || f.content === content) return p;
        return { ...p, files: p.files.map((x) => (x.id === id ? { ...x, content } : x)) };
      });
    },
    [updateProject]
  );

  const taken = (p: Project, exceptId?: string) => new Set(p.files.filter((f) => f.id !== exceptId).map((f) => f.name.toLowerCase()));

  const createFile = (name: string) => {
    if (!project) return;
    if (taken(project).has(name.toLowerCase())) return void toast.error(`Já existe "${name}"`);
    const kind = kindOf(name);
    if (kind === "asset") return void toast.error("Para imagens e mídias, use “Adicionar arquivos”");
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    const f = makeFile(name, STARTERS[ext] ?? STARTERS[kind] ?? "");
    emitRef.current("file:created");
    updateProject((p) => ({ ...p, files: [...p.files, f], openTabs: [...p.openTabs, f.id], activeFile: f.id, entry: p.entry || (kind === "html" ? f.id : p.entry) }));
    if (kind === "html") setPreviewPage(f.id);
  };

  const createFolder = (path: string) => {
    if (!project) return;
    if (folders.includes(path)) return void toast.error(`A pasta "${path}" já existe`);
    updateProject((p) => ({ ...p, folders: [...(p.folders ?? []), path] }));
  };

  const renameFile = (id: string, name: string) => {
    if (!project) return;
    if (taken(project, id).has(name.toLowerCase())) return void toast.error(`Já existe "${name}"`);
    updateProject((p) => ({ ...p, files: p.files.map((f) => (f.id === id ? { ...f, name, kind: f.kind === "asset" ? "asset" : kindOf(name), mime: mimeOf(name) } : f)) }));
    toast(`Agora é ${name}`, { description: "Atualize as referências nos outros arquivos, se houver." });
  };

  const renameFolder = (from: string, to: string) => {
    if (!project) return;
    if (folders.includes(to)) return void toast.error(`A pasta "${to}" já existe`);
    const swap = (n: string) => (n === from ? to : n.startsWith(from + "/") ? to + n.slice(from.length) : n);
    updateProject((p) => ({
      ...p,
      files: p.files.map((f) => ({ ...f, name: swap(f.name) })),
      folders: (p.folders ?? []).map(swap),
    }));
  };

  const moveFile = (id: string, dir: string) => {
    if (!project) return;
    const f = project.files.find((x) => x.id === id);
    if (!f) return;
    const name = (dir ? dir + "/" : "") + baseName(f.name);
    if (name === f.name) return;
    if (taken(project, id).has(name.toLowerCase())) return void toast.error(`Já existe "${name}"`);
    updateProject((p) => ({ ...p, files: p.files.map((x) => (x.id === id ? { ...x, name } : x)) }));
    toast(`${baseName(f.name)} → ${dir || "raiz"}`);
  };

  const moveFolder = (path: string, dir: string) => {
    const to = (dir ? dir + "/" : "") + baseName(path);
    if (to === path) return;
    renameFolder(path, to);
  };

  const deleteFile = (id: string) => {
    if (!project) return;
    const snapshot = project;
    checkpoint("pre-delete", project);
    const f = project.files.find((x) => x.id === id);
    updateProject((p) => {
      const files = p.files.filter((x) => x.id !== id);
      const openTabs = p.openTabs.filter((x) => x !== id);
      return { ...p, files, openTabs, activeFile: p.activeFile === id ? (openTabs[0] ?? null) : p.activeFile, entry: p.entry === id ? (files.find((x) => x.kind === "html")?.id ?? "") : p.entry };
    });
    toast(`"${f?.name}" excluído`, { action: { label: "Desfazer", onClick: () => updateProject((p) => (p.id === snapshot.id ? snapshot : p)) } });
  };

  const deleteFolder = (path: string) => {
    if (!project) return;
    const snapshot = project;
    checkpoint("pre-delete", project);
    const inside = (n: string) => n === path || n.startsWith(path + "/");
    const gone = new Set(project.files.filter((f) => inside(f.name)).map((f) => f.id));
    updateProject((p) => {
      const files = p.files.filter((f) => !gone.has(f.id));
      const openTabs = p.openTabs.filter((x) => !gone.has(x));
      return {
        ...p,
        files,
        folders: (p.folders ?? []).filter((d) => !inside(d)),
        openTabs,
        activeFile: p.activeFile && gone.has(p.activeFile) ? (openTabs[0] ?? null) : p.activeFile,
        entry: gone.has(p.entry) ? (files.find((x) => x.kind === "html")?.id ?? "") : p.entry,
      };
    });
    toast(`Pasta "${path}" excluída${gone.size ? ` (${gone.size} arquivos)` : ""}`, {
      action: { label: "Desfazer", onClick: () => updateProject((p) => (p.id === snapshot.id ? snapshot : p)) },
    });
  };

  const duplicateFile = (id: string) => {
    const f = project?.files.find((x) => x.id === id);
    if (!f || !project) return;
    const name = uniqueName(f.name.replace(/(\.[^./]+)?$/, "-copia$1"), taken(project));
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
  const addFiles = useCallback(
    (incoming: PFile[], dir: string, mode: "add" | "merge") => {
      checkpoint("pre-import");
      let entryId: string | null = null;
      let firstOpen: string | null = null;
      let renamed = 0;
      updateProject((p) => {
        const files = [...p.files];
        const names = taken(p);
        const opened = [...p.openTabs];
        for (const f of incoming) {
          let name = (dir ? dir + "/" : "") + f.name;
          const existing = files.findIndex((x) => x.name.toLowerCase() === name.toLowerCase());
          let id = f.id;
          if (existing >= 0 && mode === "merge") {
            id = files[existing].id;
            files[existing] = { ...files[existing], content: f.content, kind: f.kind, mime: f.mime };
          } else {
            const unique = uniqueName(name, names);
            if (unique !== name) renamed++;
            name = unique;
            names.add(name.toLowerCase());
            files.push({ ...f, name });
          }
          if (f.kind !== "asset" && !opened.includes(id) && opened.length < 16) opened.push(id);
          if (f.kind === "html" && !entryId && (!p.entry || mode === "merge")) entryId = id;
          if (!firstOpen && f.kind !== "asset") firstOpen = id;
        }
        const extra = dir && !(p.folders ?? []).includes(dir) ? [...(p.folders ?? []), dir] : (p.folders ?? []);
        return { ...p, files, folders: extra, openTabs: opened, activeFile: firstOpen ?? p.activeFile, entry: entryId ?? p.entry };
      });
      if (entryId) setPreviewPage(entryId);
      toast.success(`${incoming.length} ${incoming.length === 1 ? "arquivo adicionado" : "arquivos adicionados"}${dir ? ` em ${dir}` : ""}`, {
        description: renamed ? `${renamed} renomeado(s) para não sobrescrever` : undefined,
      });
    },
    [updateProject, checkpoint]
  );

  const receive = async (list: Incoming[], directDir: string | null = null) => {
    if (!list.length) return;
    const t = toast.loading("Lendo arquivos…");
    try {
      const files = await readIncoming(list);
      toast.dismiss(t);
      if (!files.length) return void toast.error("Nenhum arquivo utilizável");
      if (directDir !== null) {
        // pasta inteira adicionada "aqui": mantém o nome da pasta
        const root = rootFolderName(list);
        const dir = root && list.length > 0 && list.every((i) => i.path.includes("/")) ? (directDir ? directDir + "/" : "") + root : directDir;
        addFiles(files, dir, "add");
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
  const receiveRef = useRef(receive);
  receiveRef.current = receive;

  const confirmImport = (mode: ImportMode, opts: { name: string; dir: string }) => {
    if (!pendingImport || !ws) return;
    emitRef.current("project:imported");
    const incoming = pendingImport.files;
    setPendingImport(null);
    if (mode !== "new") return addFiles(incoming, opts.dir, mode);
    const textFiles = incoming.filter((f) => f.kind !== "asset");
    const html = incoming.find((f) => baseName(f.name) === "index.html" && !f.name.includes("/")) ?? incoming.find((f) => f.kind === "html");
    const firstOpen = html ?? textFiles[0] ?? null;
    const now = Date.now();
    const p: Project = {
      id: uid(),
      name: opts.name,
      files: incoming,
      folders: [],
      entry: html?.id ?? "",
      openTabs: textFiles.slice(0, 10).map((f) => f.id),
      activeFile: firstOpen?.id ?? null,
      createdAt: now,
      updatedAt: now,
    };
    setWs((w) => (w ? { ...w, projects: { ...w.projects, [p.id]: p }, order: [p.id, ...w.order], currentId: p.id } : w));
    checkpoint("import", p, { label: "Importado" });
    setPreviewPage(html?.id ?? null);
    setLogs([]);
    toast.success(`Projeto "${opts.name}" criado`, { description: `${incoming.length} arquivos importados` });
  };

  const pickFiles = (dir: string | null) => {
    importDir.current = dir;
    fileInput.current?.click();
  };
  const pickFolder = (dir: string | null) => {
    importDir.current = dir;
    folderInput.current?.click();
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
    checkpoint("pre-delete", project);
    const snapshot = ws;
    const order = ws.order.filter((x) => x !== project.id);
    let next: Workspace;
    if (!order.length) next = { ...freshWorkspace(), settings: ws.settings };
    else {
      const projects = { ...ws.projects };
      delete projects[project.id];
      next = { ...ws, projects, order, currentId: order[0] };
    }
    setWs(next);
    setPreviewPage(next.projects[next.currentId].entry);
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

  /* ---------------- inspetor ---------------- */
  const debugging = !!settings?.console && (ui.bottom === "elements" || insp.picking);
  useEffect(() => emitRef.current(debugging ? "debug:start" : "debug:stop"), [debugging]);
  uiBottomRef.current = ui.bottom;
  const inspCmd = (c: Record<string, unknown>) => {
    if (c.op === "pick") setInsp((st) => ({ ...st, picking: true, error: null }));
    if (c.op === "stop") setInsp((st) => ({ ...st, picking: false }));
    preview.current?.inspect(c);
  };
  const showElements = () => {
    setUi((u: typeof ui) => ({ ...u, bottom: "elements" }));
    if (!settings?.console) updateSettings({ console: true });
  };
  const startPick = () => {
    showElements();
    inspCmd({ op: insp.picking ? "stop" : "pick" });
  };
  const offsetToLineCol = (text: string, off: number) => {
    const before = text.slice(0, off);
    const line = (before.match(/\n/g)?.length ?? 0) + 1;
    return { line, col: off - before.lastIndexOf("\n") };
  };
  const gotoElementSource = (info: NodeInfo) => {
    const page = built.page;
    if (!page || !info.path) return void toast.warning("Este elemento não existe no HTML-fonte", { description: "Foi criado por script depois do carregamento." });
    const hit = pathToSource(page.content, info.path);
    if (!hit) return void toast.warning("Não foi possível achar este elemento no código com segurança", { description: "O HTML pode ter sido alterado por script ou corrigido pelo navegador." });
    const { line, col } = offsetToLineCol(page.content, hit.from);
    jumpTo(page.id, line, col);
  };
  const openRule = (r: MatchedRule) => {
    if (!project) return;
    const f = findFile(project.files, r.file) ?? (built.page && r.file === built.page.name ? built.page : undefined);
    if (!f) return void toast.warning(`"${r.file}" não é um arquivo do projeto`, { description: "A regra veio de uma folha externa." });
    const hit = ruleInCss(f.content, r.selector);
    if (!hit) return void toast.warning("Regra não encontrada no arquivo", { description: "Pode ter vindo de um @import ou ter sido criada por script." });
    const { line, col } = offsetToLineCol(f.content, hit.from);
    jumpTo(f.id, line, col);
  };
  const inspectAtCursor = () => {
    if (!activeFile || activeFile.kind !== "html" || !editor.current) return;
    if (built.page?.id !== activeFile.id) setPreviewPage(activeFile.id);
    const path = sourceToPath(activeFile.content, editor.current.cursorOffset());
    if (!path) return void toast("Coloque o cursor dentro de uma tag HTML");
    showElements();
    inspPath.current = path;
    setTimeout(() => inspCmd({ op: "byPath", path }), built.page?.id !== activeFile.id ? 900 : 0);
  };
  /** grava no código as mudanças temporárias do inspetor (só onde o lugar é inequívoco) */
  const applyInspector = (changes: TempChange[]) => {
    if (!project || !changes.length) return;
    const out = applyChanges(project.files, built.page?.name ?? null, changes);
    const copyFailed = () => copyText(changesToCss(out.failed.map((f) => f.change)));
    if (!out.applied.length) {
      toast.warning("Nada foi gravado", { description: out.failed[0]?.reason, action: { label: "Copiar CSS", onClick: copyFailed }, duration: 9000 });
      return;
    }
    checkpoint("pre-inspect", project, { label: `Antes de aplicar ${out.applied.length} mudança(s) do inspetor` });
    const snapshot = project;
    writeFiles(out.updates);
    setTimeout(() => runNow(true), 60);
    toast.success(`${out.applied.length} mudança(s) gravada(s) em ${Object.keys(out.updates).join(", ")}`, {
      description: "A versão anterior ficou no histórico.",
      action: { label: "Desfazer", onClick: () => updateProject((p) => (p.id === snapshot.id ? snapshot : p)) },
    });
    if (out.failed.length)
      toast.warning(`${out.failed.length} mudança(s) não foram gravadas`, { description: out.failed.map((f) => `${f.change.prop}: ${f.reason}`).join(" · "), action: { label: "Copiar CSS", onClick: copyFailed }, duration: 12000 });
  };
  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success("CSS copiado", { description: "Cole no arquivo para tornar a mudança permanente." }),
      () => toast.error("Não foi possível copiar")
    );
  };

  /* ---------------- rede e APIs ---------------- */
  const netEntries = project ? (netLogs[project.id] ?? []) : [];
  const mocksSrc = project?.files.find((f) => f.name === MOCKS_FILE)?.content;
  const mocksParsed = useMemo(() => (mocksSrc != null ? parseMocks(mocksSrc) : null), [mocksSrc]);

  /* ---------------- Extension Studio ---------------- */
  const isExt = !!project && isExtensionProject(project.files);
  const extFiles = useDeferredValue(project?.files);
  const extReport = useMemo(() => (extFiles && isExtensionProject(extFiles) ? validateExtension(extFiles) : null), [extFiles]);
  useEffect(() => setExtSize(null), [built.page?.id]);

  /** cria ou troca vários arquivos de uma vez (texto ou data URL de imagem) */
  const writeFiles = (changes: Record<string, string>) =>
    updateProject((p) => {
      let files = p.files;
      for (const [name, content] of Object.entries(changes)) {
        const kind = kindOf(name);
        const ex = files.find((f) => f.name === name);
        if (ex) files = files.map((f) => (f.id === ex.id ? { ...f, content } : f));
        else files = [...files, { id: uid(), name, kind, content, mime: mimeOf(name) }];
      }
      return { ...p, files };
    });

  const showExtPanel = () => updateSettings({ sidebar: true, panel: "extension" });

  const applyExtFix = (fix: ExtFix) => {
    if (!project) return;
    const ch = applyFix(project.files, fix);
    if (!ch) return void toast.error("Não foi possível aplicar a correção", { description: "O arquivo mudou ou o manifesto tem JSON inválido." });
    checkpoint("pre-ext", project, { label: `Antes de: ${fix.label}` });
    const snapshot = project;
    writeFiles(ch);
    toast.success(fix.label, { action: { label: "Desfazer", onClick: () => updateProject((p) => (p.id === snapshot.id ? snapshot : p)) } });
    if (fix.kind === "create") setTimeout(() => {
      const f = wsRef.current?.projects[wsRef.current.currentId].files.find((x) => x.name === fix.file);
      if (f && f.kind !== "asset") openFile(f.id);
    }, 60);
  };

  /** o formulário grava a cada mudança; uma versão no histórico a cada minuto, no máximo */
  const onManifestForm = (next: string) => {
    const mf = project?.files.find((f) => f.name === MANIFEST);
    if (!mf || !project) return;
    if (Date.now() - lastExtCp.current > 60000) {
      lastExtCp.current = Date.now();
      checkpoint("pre-ext", project, { label: "Antes de editar o manifesto" });
    }
    onChange(mf.id, next);
  };

  const setMMode = (mode: "form" | "json") => {
    setManifestMode(mode);
    localStorage.setItem("poiesis:manifest-mode", mode);
  };

  const openExtFile = (name: string, from?: number) => {
    const f = project?.files.find((x) => x.name === name);
    if (!f) return void toast.warning(`"${name}" não existe no projeto`);
    if (f.kind === "asset") return openFile(f.id);
    if (from != null) {
      if (name === MANIFEST) setMMode("json");
      const { line, col } = offsetToLineCol(f.content, from);
      jumpTo(f.id, line, col);
    } else openFile(f.id);
  };

  const openManifestAt = (path?: JPath) => {
    const mf = project?.files.find((f) => f.name === MANIFEST);
    if (!mf) return;
    setMMode("json");
    if (!path) return openFile(mf.id);
    const { line, col } = offsetToLineCol(mf.content, jsonRange(mf.content, path, true).from);
    jumpTo(mf.id, line, col);
  };

  const openManifestForm = () => {
    const mf = project?.files.find((f) => f.name === MANIFEST);
    if (!mf) return;
    setMMode("form");
    openFile(mf.id);
  };

  const previewExtPage = (path: string) => {
    const f = project?.files.find((x) => x.name === path && x.kind === "html");
    if (!f) return;
    setPreviewPage(f.id);
    if (settings?.layout === "editor") updateSettings({ layout: "split" });
    if (settings?.device !== "full") updateSettings({ device: "full" });
  };

  const createExtension = async (o: ExtOptions) => {
    try {
      const p = await extensionProject(o);
      setWs((w) => (w ? { ...w, projects: { ...w.projects, [p.id]: p }, order: [p.id, ...w.order], currentId: p.id } : w));
      checkpoint("import", p, { label: "Nova extensão" });
      setPreviewPage(p.entry || null);
      setLogs([]);
      setExtNew(false);
      setMMode("form");
      showExtPanel();
      toast.success(`Extensão "${p.name}" criada`, { description: "O preview simula as APIs chrome.*. Para testar de verdade, exporte e carregue em chrome://extensions." });
    } catch (e) {
      toast.error("Não foi possível criar a extensão", { description: (e as Error).message });
    }
  };

  const convertToExtension = () => {
    if (!project) return;
    if (project.files.some((f) => f.name === MANIFEST)) return void toast.error("Já existe um manifest.json na raiz", { description: "Adicione \"manifest_version\": 3 nele para o Poiesis tratá-lo como extensão." });
    const entry = project.files.find((f) => f.id === project.entry && f.kind === "html");
    const m: Record<string, unknown> = {
      manifest_version: 3,
      name: project.name.slice(0, 75),
      version: "1.0.0",
      description: "",
      action: entry ? { default_popup: entry.name } : {},
    };
    checkpoint("pre-ext", project, { label: "Antes de virar extensão" });
    writeFiles({ [MANIFEST]: JSON.stringify(m, null, 2) + "\n" });
    setMMode("form");
    setTimeout(() => {
      const f = wsRef.current?.projects[wsRef.current.currentId].files.find((x) => x.name === MANIFEST);
      if (f) openFile(f.id);
    }, 60);
    toast.success("manifest.json criado", { description: entry ? `${entry.name} virou o popup. Revise os problemas no painel Extensão.` : "Revise os problemas no painel Extensão." });
  };

  const applyIcons = (icons: Record<number, string>) => {
    if (!project) return;
    const mf = project.files.find((f) => f.name === MANIFEST);
    const changes: Record<string, string> = {};
    for (const [s, url] of Object.entries(icons)) changes[`icons/icon-${s}.png`] = url;
    if (mf) {
      const next = editManifest(mf.content, (m) => {
        m.icons = Object.fromEntries(Object.keys(icons).map((s) => [s, `icons/icon-${s}.png`]));
        if (m.action && typeof m.action === "object") setAt(m, ["action", "default_icon"], { "16": "icons/icon-16.png", "32": "icons/icon-32.png" });
      });
      if (next == null) return void toast.error("Corrija o JSON do manifesto antes de gerar os ícones");
      changes[MANIFEST] = next;
    }
    checkpoint("pre-ext", project, { label: "Antes de gerar ícones" });
    const snapshot = project;
    writeFiles(changes);
    setIconsOpen(false);
    toast.success("Ícones gerados", { description: "icons/icon-16, 32, 48 e 128.png, ligados no manifesto.", action: { label: "Desfazer", onClick: () => updateProject((p) => (p.id === snapshot.id ? snapshot : p)) } });
  };

  /* fixtures do chrome.* simulado */
  const chromeSrc = project?.files.find((f) => f.name === CHROME_FILE)?.content;
  const chromeParsed = useMemo(() => (chromeSrc != null ? parseChromeFixtures(chromeSrc) : null), [chromeSrc]);
  const saveChrome = (c: ChromeFixtures, resetStorage: boolean) => {
    if (!project) return;
    if (chromeSrc != null && chromeParsed?.errors.some((e) => e.startsWith("JSON inválido"))) return void toast.error(`${CHROME_FILE} tem JSON inválido`, { description: "Corrija o arquivo antes, para não perder o que está nele." });
    checkpoint("pre-ext", project, { label: "Antes de mudar a simulação do chrome.*" });
    writeFiles({ [CHROME_FILE]: stringifyChromeFixtures(c) });
    if (resetStorage) {
      delete extStorage.current[project.id];
      try {
        localStorage.setItem("poiesis:ext-storage", JSON.stringify(extStorage.current));
      } catch {
        /* ignora */
      }
    }
    setChromeOpen(false);
    setTimeout(() => runNow(true), 60);
    toast.success("Simulação salva", { description: `${c.messages.filter((m) => m.enabled).length} resposta(s) simulada(s), ${c.tabs.length || 1} aba(s) fictícia(s).${resetStorage ? " O chrome.storage do preview recomeçou com os dados da fixture." : ""}` });
  };
  const openChromeFile = () => {
    if (!project) return;
    if (chromeSrc == null) writeFiles({ [CHROME_FILE]: stringifyChromeFixtures({ version: 1, storage: { local: {}, sync: {} }, tabs: [], messages: [] }) });
    setChromeOpen(false);
    setTimeout(() => {
      const f = wsRef.current?.projects[wsRef.current.currentId].files.find((x) => x.name === CHROME_FILE);
      if (f) openFile(f.id);
    }, 60);
  };

  const exportExtension = (force = false) => {
    if (!project) return;
    const rep = validateExtension(project.files);
    if (!force && rep.problems.some((p) => p.sev === "error")) return void setExtExport(true);
    const { include, excluded } = extensionZipFiles(project, rep.manifest ?? {});
    const enc = new TextEncoder();
    const entries: Record<string, Uint8Array> = {};
    for (const f of include) entries[f.name] = f.kind === "asset" ? dataURLToBytes(f.content) : enc.encode(f.content);
    const zipped = zipSync(entries, { level: 6 });
    const version = typeof rep.manifest?.version === "string" ? "-" + rep.manifest.version.replace(/[^\w.]+/g, "") : "";
    const name = `${slug(project.name)}${version}.zip`;
    download(name, new Blob([zipped as BlobPart], { type: "application/zip" }));
    exported();
    setExtExport(false);
    toast.success("Extensão exportada", {
      description: `${name}: descompacte e, em chrome://extensions (modo do desenvolvedor), use "Carregar sem compactação".${excluded.length ? ` Ficaram fora: ${excluded.join(", ")}.` : ""}`,
      duration: 9000,
    });
  };

  /** cria ou troca o conteúdo de um arquivo de texto do projeto */
  const upsertFile = (name: string, content: string) =>
    updateProject((p) => {
      const ex = p.files.find((f) => f.name === name);
      if (ex) return { ...p, files: p.files.map((f) => (f.id === ex.id ? { ...f, content } : f)) };
      return { ...p, files: [...p.files, { id: uid(), name, kind: kindOf(name), content, mime: mimeOf(name) }] };
    });

  const showNetwork = () => {
    setUi((u: typeof ui) => ({ ...u, bottom: "network" }));
    if (!settings?.console) updateSettings({ console: true });
  };

  const sendRequest = (r: NetRequest) => {
    showNetwork();
    preview.current?.netSend(r);
  };

  const saveMocks = (c: MocksConfig) => {
    if (mocksSrc != null && mocksParsed?.errors.some((e) => e.includes("JSON inválido"))) {
      return void toast.error(`${MOCKS_FILE} tem JSON inválido`, { description: "Corrija o arquivo antes de salvar pelo editor de mocks, para não perder o que está nele." });
    }
    if (project) checkpoint("pre-mocks", project, { label: "Antes de salvar os mocks" });
    upsertFile(MOCKS_FILE, stringifyMocks(c));
    toast.success("Mocks salvos", { description: `${c.mocks.filter((m) => m.enabled).length} ativo(s) em ${MOCKS_FILE}` });
  };

  const mockFrom = (e: NetEntry) => {
    if (!project || e.resBody?.v == null) return;
    if (mocksSrc != null && mocksParsed?.errors.some((x) => x.includes("JSON inválido"))) return void toast.error(`${MOCKS_FILE} tem JSON inválido`);
    let path = e.url;
    let abs = true;
    try {
      const u = new URL(e.url);
      path = u.origin + u.pathname;
    } catch {
      abs = false;
      path = e.url.split("?")[0];
    }
    const slug = (e.method + "-" + (path.replace(/^https?:\/\//, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "resposta")).toLowerCase().slice(0, 60);
    const json = /json/i.test(e.resBody.mime ?? "") || /^\s*[[{]/.test(e.resBody.v);
    let fixture = `mocks/${slug}.${json ? "json" : "txt"}`;
    const names = new Set(project.files.map((f) => f.name));
    for (let i = 2; names.has(fixture); i++) fixture = `mocks/${slug}-${i}.${json ? "json" : "txt"}`;
    // campos com cara de segredo (token, password…) saem mascarados na fixture
    const raw = e.resBody.v;
    let body = maskBody(e.resBody)?.v ?? raw;
    let maskedAny = false;
    try {
      maskedAny = json ? JSON.stringify(JSON.parse(body)) !== JSON.stringify(JSON.parse(raw)) : body !== raw;
    } catch {
      body = raw;
    }
    if (json) {
      try {
        body = JSON.stringify(JSON.parse(body), null, 2) + "\n";
      } catch {
        /* mantém */
      }
    }
    const base = mocksParsed?.config ?? { version: 1 as const, enabled: true, mocks: [] };
    const ids = new Set(base.mocks.map((m) => m.id));
    let id = slug.slice(0, 40);
    for (let i = 2; ids.has(id); i++) id = `${slug.slice(0, 36)}-${i}`;
    const ct = e.resHeaders.find(([k]) => /^content-type$/i.test(k))?.[1];
    const rule: MockRule = { id, enabled: true, method: e.method, url: abs ? path : path || "/", status: e.status || 200, headers: ct ? { "Content-Type": ct } : {}, bodyFile: fixture, delay: 0, error: null };
    checkpoint("pre-mocks", project, { label: "Antes de criar um mock" });
    upsertFile(fixture, body);
    upsertFile(MOCKS_FILE, stringifyMocks({ ...base, mocks: [...base.mocks, rule] }));
    toast.success("Mock criado", {
      description: `Resposta salva em ${fixture} (só o corpo e o Content-Type).${maskedAny ? " Campos sensíveis (token, senha…) foram mascarados." : ""} Revise se ela tiver dados pessoais.`,
    });
  };

  const openMocksFile = () => {
    if (!project) return;
    if (!project.files.some((f) => f.name === MOCKS_FILE)) upsertFile(MOCKS_FILE, stringifyMocks({ version: 1, enabled: true, mocks: [] }));
    setMocksOpen(false);
    setTimeout(() => {
      const f = wsRef.current?.projects[wsRef.current.currentId].files.find((x) => x.name === MOCKS_FILE);
      if (f) openFile(f.id);
    }, 50);
  };

  const exportHar = () => {
    if (!project || !netEntries.length) return;
    const har = toHar(netEntries, project.name);
    download(`${slug(project.name)}-rede.har`, new Blob([JSON.stringify(har, null, 2)], { type: "application/json" }));
    toast.success("HAR exportado", { description: "Tokens, cookies e senhas saem mascarados. Mesmo assim, revise antes de compartilhar." });
  };

  const jumpInitiator = (ini: string) => {
    const m = /^(.*):(\d+)$/.exec(ini);
    if (!m || !project) return;
    const f = findFile(project.files, m[1]);
    if (f) jumpTo(f.id, +m[2], 1);
  };

  /* ---------------- restauração do histórico ---------------- */
  const restoreFrom = async (rev: Revision, paths?: string[]) => {
    const p = wsRef.current?.projects[rev.projectId];
    if (!p) return void toast.error("Este projeto não existe mais");
    const pre = await checkpoint("pre-restore", p);
    if (!pre) return; // sem a versão de segurança, não restaura
    try {
      const next = await restoreProject(p, rev, paths);
      updateProject((cur) => (cur.id === next.id ? next : cur));
      setCompareRev(null);
      const what = paths ? (paths.length === 1 ? paths[0] : `${paths.length} arquivos`) : "Projeto";
      toast.success(`${what} restaurado`, {
        description: "O estado anterior ficou salvo no histórico.",
        action: { label: "Desfazer", onClick: () => restoreFrom(pre) },
      });
      if (!paths) setPreviewPage(next.entry || null);
    } catch (e) {
      toast.error("Falha ao restaurar", { description: dbErrorMessage(e) });
    }
  };

  const applyChunks = async (rev: Revision, path: string, content: string) => {
    const p = wsRef.current?.projects[rev.projectId];
    if (!p) return;
    const pre = await checkpoint("pre-restore", p, { label: `Antes de trazer trechos de ${path}` });
    if (!pre) return;
    updateProject((cur) => (cur.id === p.id ? { ...cur, files: cur.files.map((f) => (f.name === path ? { ...f, content } : f)) } : cur));
    toast.success(`Trechos aplicados em ${path}`, { action: { label: "Desfazer", onClick: () => restoreFrom(pre, [path]) } });
  };

  const exportProjectHistory = async () => {
    if (!project) return;
    try {
      const data = await exportHistory(project);
      download(`${slug(project.name)}-historico.json`, new Blob([JSON.stringify(data)], { type: "application/json" }));
      toast.success(`${data.revisions.length} versões exportadas`, { description: "O arquivo pode conter tudo o que já existiu no projeto." });
    } catch (e) {
      toast.error("Falha ao exportar o histórico", { description: dbErrorMessage(e) });
    }
  };

  const importProjectHistory = async (file: File | undefined) => {
    if (!file || !project) return;
    try {
      const r = await importHistory(JSON.parse(await file.text()), project.id);
      setHistoryTick((t) => t + 1);
      toast.success(`${r.added} versões importadas para "${project.name}"`, { description: r.skipped ? `${r.skipped} já existiam` : undefined });
    } catch (e) {
      toast.error("Histórico não importado", { description: (e as Error).message });
    }
  };

  /* ---------------- exportação ---------------- */
  /** primeira exportação: um marco cosmético (flor do Pólen, estrela da Lúmen) */
  const exported = () => {
    emitRef.current("project:exported");
    if (settings && !settings.companionMarks.firstExport) updateSettings({ companionMarks: { ...settings.companionMarks, firstExport: Date.now() } });
  };

  const exportHtml = () => {
    if (!project || !settings) return;
    exported();
    const r = buildPage(project, previewPage, { console: false, autoInject: settings.autoInject });
    const name = r.page ? baseName(r.page.name).replace(/\.html?$/i, "") : "index";
    download(`${slug(project.name)}${name !== "index" ? "-" + name : ""}.html`, new Blob([r.html], { type: "text/html" }));
  };

  const exportZip = () => {
    if (!project) return;
    const entries: Record<string, Uint8Array> = {};
    const enc = new TextEncoder();
    for (const d of project.folders ?? []) entries[d + "/"] = new Uint8Array();
    for (const f of project.files) entries[f.name] = f.kind === "asset" ? dataURLToBytes(f.content) : enc.encode(f.content);
    const zipped = zipSync(entries, { level: 6 });
    download(`${slug(project.name)}.zip`, new Blob([zipped as BlobPart], { type: "application/zip" }));
    toast.success("Projeto exportado", { description: `${project.files.length} arquivos em ${slug(project.name)}.zip` });
    exported();
  };

  const backup = () => {
    if (!ws) return;
    download(`poiesis-backup-${new Date().toISOString().slice(0, 10)}.json`, new Blob([JSON.stringify(ws)], { type: "application/json" }));
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
    if (!activeFile || !settings || !canFormat(activeFile.kind, activeFile.name)) return;
    setFormatting(true);
    try {
      const out = await formatCode(activeFile.content, activeFile.kind, settings.tabSize, activeFile.name);
      onChange(activeFile.id, out);
    } catch (e) {
      toast.error("Não deu pra formatar", { description: String((e as Error)?.message || e).split("\n")[0] });
    } finally {
      setFormatting(false);
    }
  };

  /* ---------------- renomear símbolo no projeto ---------------- */
  const symbolEdits = (sym: Sym) => {
    if (!project) return [];
    const ix = buildIndex(project.files);
    const locs: Loc[] =
      sym.kind === "class"
        ? [...(ix.classes.get(sym.name)?.defs ?? []), ...(ix.classes.get(sym.name)?.uses ?? [])]
        : sym.kind === "id"
          ? [...(ix.ids.get(sym.name)?.defs ?? []), ...(ix.ids.get(sym.name)?.styles ?? []), ...(ix.ids.get(sym.name)?.uses ?? [])]
          : sym.kind === "var"
            ? [...(ix.vars.get(sym.name)?.defs ?? []), ...(ix.vars.get(sym.name)?.uses ?? [])]
            : sym.kind === "keyframes"
              ? [...(ix.keyframes.get(sym.name)?.defs ?? []), ...(ix.keyframes.get(sym.name)?.uses ?? [])]
              : [];
    const files = new Map(project.files.map((f) => [f.id, f]));
    return locs.filter((l) => files.get(l.fileId)?.content.slice(l.from, l.from + sym.name.length) === sym.name);
  };

  const askRename = (sym: Sym) => {
    if (!["class", "id", "var", "keyframes"].includes(sym.kind)) return false;
    setRenameTarget({ sym, label: symLabel(sym), name: sym.name, count: symbolEdits(sym).length });
    return true;
  };

  const doRename = (newName: string) => {
    if (!renameTarget || !project) return;
    const { sym } = renameTarget;
    setRenameTarget(null);
    const edits = symbolEdits(sym);
    checkpoint("pre-rename", project, { label: `Antes de renomear ${renameTarget.label}` });
    const byFile = new Map<string, Loc[]>();
    for (const l of edits) byFile.set(l.fileId, [...(byFile.get(l.fileId) ?? []), l]);
    const snapshot = project;
    updateProject((p) => ({
      ...p,
      files: p.files.map((f) => {
        const ls = byFile.get(f.id);
        if (!ls) return f;
        let c = f.content;
        for (const l of [...ls].sort((a, b) => b.from - a.from)) c = c.slice(0, l.from) + newName + c.slice(l.from + sym.name.length);
        return { ...f, content: c };
      }),
    }));
    toast.success(`${renameTarget.label} → ${newName}`, {
      description: `${edits.length} ocorrências em ${byFile.size} arquivo(s)`,
      action: { label: "Desfazer", onClick: () => updateProject((p) => (p.id === snapshot.id ? snapshot : p)) },
    });
  };

  /* ---------------- busca no projeto ---------------- */
  const openSearch = (q = "") => {
    updateSettings({ sidebar: true, panel: "search" });
    setSearchSeed({ q, n: Date.now() });
  };

  const replaceAll = (changes: { id: string; content: string }[], count: number) => {
    if (!project) return;
    const snapshot = project;
    checkpoint("pre-replace", project);
    const map = new Map(changes.map((c) => [c.id, c.content]));
    updateProject((p) => ({ ...p, files: p.files.map((f) => (map.has(f.id) ? { ...f, content: map.get(f.id)! } : f)) }));
    toast.success(`${count} substituições`, { action: { label: "Desfazer", onClick: () => updateProject((p) => (p.id === snapshot.id ? snapshot : p)) } });
  };

  /* ---------------- ícones Material Symbols ---------------- */
  const openSymbols = () => {
    const editable = activeFile && activeFile.kind !== "asset";
    setSymbolPicker({
      lang: editable ? (editor.current?.langAtCursor() ?? "html") : "html",
      current: editable ? (editor.current?.iconAtCursor() ?? null) : null,
    });
  };

  const insertSymbol = (p: SymbolPick) => {
    const ctx = symbolPicker;
    const file = activeFile && activeFile.kind !== "asset" ? activeFile : null;
    if (!file || !editor.current) {
      navigator.clipboard.writeText(p.code);
      toast.success("Abra um arquivo para inserir — o código foi copiado", { description: p.code });
      return;
    }
    if (ctx?.current) {
      editor.current.insert(p.name, { replace: { from: ctx.current.from, to: ctx.current.to } });
      toast(`Ícone trocado: ${ctx.current.name} → ${p.name}`);
      return;
    }
    let headLink: string | undefined;
    let linkedIn: string | null = null;
    if (p.addLink) {
      if (file.kind === "html") {
        if (!hasSymbolsLink(file.content, p.options.style)) {
          headLink = linkTag(p.options.style);
          linkedIn = file.name;
        }
      } else if (project) {
        // CSS/JS: o <link> vai para a página principal (ou a que está no preview)
        const page = project.files.find((f) => f.id === (previewPage ?? project.entry) && f.kind === "html") ?? project.files.find((f) => f.kind === "html");
        if (page) {
          const next = withSymbolsLink(page.content, p.options.style);
          if (next) {
            updateProject((pr) => ({ ...pr, files: pr.files.map((f) => (f.id === page.id ? { ...f, content: next } : f)) }));
            linkedIn = page.name;
          }
        }
      }
    }
    editor.current.insert(p.code, { headLink });
    toast.success(`Ícone “${p.name}” inserido`, { description: linkedIn ? `Fonte Material Symbols adicionada ao <head> de ${linkedIn}` : undefined });
  };

  /* ---------------- console ---------------- */
  const evalCode = (code: string) => {
    setLogs((ls) => [...ls, { id: ++logSeq, level: "input", args: [{ t: "str", v: code }], count: 1, time: Date.now() }]);
    preview.current?.eval(code);
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

  /* ---------------- painel lateral ---------------- */
  const selectPanel = (p: Panel) => {
    if (!settings) return;
    if (settings.sidebar && settings.panel === p) updateSettings({ sidebar: false });
    else updateSettings({ sidebar: true, panel: p });
  };

  /* ---------------- atalhos ---------------- */
  const layoutCycle: Layout[] = ["split", "stack", "editor", "preview"];
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    if (!settings) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    const inEditor = !!(e.target as HTMLElement | null)?.closest?.(".cm-editor");
    if (mod && e.shiftKey && k === "f") {
      e.preventDefault();
      openSearch(editor.current?.getSelection() ?? "");
    } else if (mod && !e.shiftKey && k === "p") {
      e.preventDefault();
      setPalette("files");
    } else if (mod && (k === "k" || (e.shiftKey && k === "p"))) {
      e.preventDefault();
      setPalette("all");
    } else if (mod && (k === "s" || k === "enter")) {
      e.preventDefault();
      if (!inEditor) runUser();
    } else if (mod && k === "b") {
      e.preventDefault();
      updateSettings({ sidebar: !settings.sidebar });
    } else if (mod && k === "j") {
      e.preventDefault();
      updateSettings({ console: !settings.console });
    } else if (mod && k === "r" && !e.shiftKey) {
      e.preventDefault();
      runUser();
    } else if (mod && k === "o") {
      e.preventDefault();
      pickFiles(null);
    } else if (mod && k === "\\") {
      e.preventDefault();
      updateSettings({ layout: layoutCycle[(layoutCycle.indexOf(settings.layout) + 1) % layoutCycle.length] });
    } else if (e.altKey && !mod && k === "z") {
      e.preventDefault();
      updateSettings({ wrap: !settings.wrap });
    } else if (e.altKey && e.shiftKey && k === "f") {
      e.preventDefault();
      format();
    } else if (mod && e.shiftKey && k === "c" && !inEditor) {
      e.preventDefault();
      startPick();
    } else if (mod && e.shiftKey && k === "c" && inEditor && activeFile?.kind === "html") {
      e.preventDefault();
      inspectAtCursor();
    } else if (e.altKey && !mod && !e.shiftKey && k === "i") {
      e.preventDefault();
      openSymbols();
    } else if (e.key === "F2" && activeFile) {
      e.preventDefault();
      const sym = inEditor ? editor.current?.symbolAtCursor() : null;
      if (sym && askRename(sym)) return;
      const n = prompt("Novo nome do arquivo:", activeFile.name);
      if (n && n.trim() && n !== activeFile.name) renameFile(activeFile.id, n.trim());
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, []);

  /* ---------------- arrastar e soltar na janela ---------------- */
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
      if (!isFiles(e)) return;
      e.preventDefault();
      const inExplorer = !!(e.target as HTMLElement | null)?.closest?.("[data-explorer]");
      setDropping(!inExplorer);
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

  /* ---------------- comandos da paleta ---------------- */
  const commands: Cmd[] = settings
    ? [
        { id: "run", group: "Executar", label: "Executar agora", icon: "play_arrow", shortcut: "Ctrl ↵", run: () => runUser() },
        { id: "net", group: "Rede", label: "Mostrar painel de rede", icon: "lan", run: showNetwork },
        { id: "music", group: "Foco", label: music.state === "playing" ? "Pausar a música de foco" : "Tocar a música de foco", icon: "headphones", run: music.toggle },
        { id: "insp", group: "Inspetor", label: "Selecionar elemento no preview", icon: "arrow_selector_tool", shortcut: "Ctrl Shift C", run: startPick },
        { id: "insp-show", group: "Inspetor", label: "Mostrar elementos", icon: "account_tree", run: showElements },
        { id: "net-req", group: "Rede", label: "Nova requisição (console de APIs)", icon: "send", run: () => setReqDialog({ open: true }) },
        { id: "net-mocks", group: "Rede", label: "Editar mocks", icon: "dns", run: () => setMocksOpen(true) },
        { id: "ext-new", group: "Extensão", label: "Nova extensão…", icon: "extension", run: () => setExtNew(true) },
        { id: "ext-panel", group: "Extensão", label: "Mostrar painel Extensão", icon: "extension", run: showExtPanel },
        ...(isExt
          ? [
              { id: "ext-export", group: "Extensão", label: "Exportar extensão (.zip)", icon: "folder_zip", run: () => exportExtension() },
              { id: "ext-form", group: "Extensão", label: "Editar manifesto (formulário)", icon: "tune", run: openManifestForm },
              { id: "ext-icons", group: "Extensão", label: "Gerar ícones…", icon: "image", run: () => setIconsOpen(true) },
              { id: "ext-sim", group: "Extensão", label: "Simulação do chrome.* (fixtures)…", icon: "science", run: () => setChromeOpen(true) },
            ]
          : [{ id: "ext-convert", group: "Extensão", label: "Transformar este projeto em extensão", icon: "transform", run: convertToExtension }]),
        ...(folder.enabled
          ? [
              { id: "fold-open", group: "Pasta no computador", label: "Abrir pasta do computador…", icon: "folder_open", run: openLocalFolder },
              ...(folderStatus
                ? [
                    { id: "fold-sync", group: "Pasta no computador", label: "Sincronizar com a pasta agora", icon: "sync", run: () => project && folder.syncNow(project.id) },
                    { id: "fold-unlink", group: "Pasta no computador", label: "Desvincular da pasta", icon: "link_off", run: unlinkFolder },
                  ]
                : [{ id: "fold-link", group: "Pasta no computador", label: "Vincular este projeto a uma pasta…", icon: "add_link", run: linkCurrentFolder }]),
            ]
          : []),
        { id: "auto", group: "Executar", label: settings.autoRun ? "Desligar modo ao vivo" : "Ligar modo ao vivo", icon: "bolt", run: () => updateSettings({ autoRun: !settings.autoRun }) },
        { id: "fmt", group: "Editor", label: "Formatar documento", icon: "format_align_left", shortcut: "Shift Alt F", run: format },
        { id: "def", group: "Editor", label: "Definição do símbolo no cursor", icon: "menu_book", shortcut: "Alt F1", run: () => editor.current?.showDefinition() },
        { id: "goto", group: "Editor", label: "Ir para definição", icon: "call_made", shortcut: "F12", run: () => editor.current?.gotoDefinition() },
        { id: "find", group: "Editor", label: "Buscar e substituir no arquivo", icon: "search", shortcut: "Ctrl F", run: () => editor.current?.search() },
        { id: "findp", group: "Editor", label: "Buscar no projeto", icon: "manage_search", shortcut: "Ctrl Shift F", run: () => openSearch() },
        { id: "wrap", group: "Editor", label: "Alternar quebra de linha", icon: "wrap_text", shortcut: "Alt Z", run: () => updateSettings({ wrap: !settings.wrap }) },
        { id: "comment", group: "Editor", label: "Comentar/descomentar linha", icon: "comment", shortcut: "Ctrl /", run: () => editor.current?.comment() },
        { id: "hover", group: "Editor", label: settings.hoverDocs ? "Desligar definições ao passar o mouse" : "Ligar definições ao passar o mouse", icon: "menu_book", run: () => updateSettings({ hoverDocs: !settings.hoverDocs }) },
        { id: "font+", group: "Editor", label: "Aumentar fonte", icon: "text_increase", run: () => updateSettings({ fontSize: Math.min(22, settings.fontSize + 1) }) },
        { id: "font-", group: "Editor", label: "Diminuir fonte", icon: "text_decrease", run: () => updateSettings({ fontSize: Math.max(10, settings.fontSize - 1) }) },
        { id: "sidebar", group: "Exibir", label: "Mostrar/esconder painel lateral", icon: "left_panel_open", shortcut: "Ctrl B", run: () => updateSettings({ sidebar: !settings.sidebar }) },
        { id: "console", group: "Exibir", label: "Mostrar/esconder console", icon: "terminal", shortcut: "Ctrl J", run: () => updateSettings({ console: !settings.console }) },
        { id: "l-split", group: "Exibir", label: "Layout lado a lado", icon: "vertical_split", run: () => updateSettings({ layout: "split" }) },
        { id: "l-stack", group: "Exibir", label: "Layout empilhado", icon: "horizontal_split", run: () => updateSettings({ layout: "stack" }) },
        { id: "l-editor", group: "Exibir", label: "Só editor", icon: "code", run: () => updateSettings({ layout: "editor" }) },
        { id: "l-preview", group: "Exibir", label: "Só preview", icon: "visibility", run: () => updateSettings({ layout: "preview" }) },
        { id: "d-full", group: "Exibir", label: "Preview: tela cheia", icon: "desktop_windows", run: () => updateSettings({ device: "full" }) },
        { id: "d-tab", group: "Exibir", label: "Preview: tablet", icon: "tablet_mac", run: () => updateSettings({ device: "tablet" }) },
        { id: "d-mob", group: "Exibir", label: "Preview: celular", icon: "smartphone", run: () => updateSettings({ device: "mobile" }) },
        ...["tinta", "dracula", "onedark", "monokai", "nord", "tokyo", "catppuccin", "solarized", "papel"].map((id) => ({
          id: "t-" + id,
          group: "Tema",
          label: "Tema: " + themeById(id).name,
          icon: themeById(id).dark ? "dark_mode" : "light_mode",
          run: () => updateSettings({ theme: id }),
        })),
        { id: "newf", group: "Projeto", label: "Novo arquivo", icon: "note_add", run: () => updateSettings({ sidebar: true, panel: "files" }) },
        { id: "imp-f", group: "Projeto", label: "Importar arquivos", icon: "upload_file", shortcut: "Ctrl O", run: () => pickFiles(null) },
        { id: "imp-d", group: "Projeto", label: "Importar pasta", icon: "drive_folder_upload", run: () => pickFolder(null) },
        { id: "exp-z", group: "Projeto", label: "Exportar projeto (.zip)", icon: "folder_zip", run: exportZip },
        { id: "exp-h", group: "Projeto", label: "Exportar HTML único", icon: "html", run: exportHtml },
        { id: "new", group: "Projeto", label: "Novo projeto em branco", icon: "add", run: () => createProject("vazio") },
        {
          id: "clear-storage",
          group: "Console",
          label: "Limpar localStorage do preview (e chrome.storage simulado)",
          icon: "delete_sweep",
          run: () => {
            delete previewStorage.current[project!.id];
            delete extStorage.current[project!.id];
            localStorage.setItem("poiesis:preview-storage", JSON.stringify(previewStorage.current));
            localStorage.setItem("poiesis:ext-storage", JSON.stringify(extStorage.current));
            runNow(true);
            toast("localStorage do preview limpo");
          },
        },
        { id: "clear", group: "Console", label: "Limpar console", icon: "block", run: () => setLogs([]) },
        { id: "icon", group: "Editor", label: "Inserir ícone Material Symbols…", icon: "interests", shortcut: "Alt I", run: () => openSymbols() },
        { id: "keys", group: "Geral", label: "Atalhos de teclado", icon: "keyboard", run: () => setShortcutsOpen(true) },
        { id: "prefs", group: "Geral", label: "Preferências", icon: "settings", run: () => setSettingsOpen(true) },
      ]
    : [];

  if (!ws || !project || !settings) {
    return (
      <div className="flex h-full items-center justify-center">
        <Logo size={48} className="animate-pulse" />
      </div>
    );
  }

  const htmlPages = project.files.filter((f) => f.kind === "html");
  const companionEl = (place: "rail" | "top") =>
    settings.companion !== "nenhum" && settings.companionPlace === place ? (
      <Companion
        id={settings.companion}
        pose={comp.pose}
        level={settings.companionLevel}
        bloom={!!settings.companionMarks.firstExport}
        reactions={comp.reactions}
        size={place === "rail" ? 60 : 44}
        place={place}
        className={pageHidden ? "pzc-paused" : undefined}
        onClick={() => comp.emit("mascot:clicked")}
      />
    ) : null;
  const showManifestForm = isExt && activeFile?.name === MANIFEST && manifestMode === "form";
  const extRole = isExt && built.page && extReport?.manifest ? pageRole(extReport.manifest, built.page.name) : null;
  const showEditor = settings.layout !== "preview";
  const showPreview = settings.layout !== "editor";
  const dir = settings.layout === "stack" ? "col" : "row";

  const bottomTabs = (
            <div className="md-seg mr-2 h-7" role="tablist" aria-label="Painel inferior">
              {(
                [
                  ["console", "Console", "terminal"],
                  ["elements", "Elementos", "arrow_selector_tool"],
                  ["network", "Rede", "lan"],
                ] as const
              ).map(([k, label, icon]) => (
                <button key={k} role="tab" aria-selected={ui.bottom === k} data-on={ui.bottom === k} onClick={() => setUi((u: typeof ui) => ({ ...u, bottom: k }))} className="!px-2.5 text-[12px]">
                  <Icon name={icon} size={15} /> {label}
                  {k === "network" && netEntries.length > 0 && <span className="text-[10.5px] tabular-nums opacity-70">{netEntries.length}</span>}
                </button>
              ))}
            </div>
          );

  const editorPane = (
    <div className="md-pane flex h-full flex-col" style={{ background: "var(--syn-bg)" }}>
      {folderStatus && folderStatus.state !== "linked" && (
        <div role="alert" className="flex shrink-0 items-center gap-3 border-b border-md-outline-v bg-[color-mix(in_oklab,var(--amber)_14%,transparent)] px-4 py-2 text-[12.5px] text-md-on-surface">
          <Icon name={folderStatus.state === "permission" ? "lock" : "folder_off"} size={18} className="text-[var(--amber)]" />
          <span className="min-w-0 flex-1">
            <b className="font-code">{folderStatus.name}</b> —{" "}
            {folderStatus.state === "permission"
              ? "o navegador precisa da sua permissão para acessar esta pasta de novo. Até lá, o projeto fica somente leitura."
              : (folderStatus.error ?? "não foi possível acessar a pasta.") + " O projeto fica somente leitura, com o último conteúdo conhecido."}
          </span>
          <button className="md-btn md-btn-filled h-8" onClick={() => project && folder.reconnect(project.id).then((ok) => !ok && toast.error("Ainda sem acesso à pasta"))}>
            {folderStatus.state === "permission" ? "Permitir acesso" : "Tentar de novo"}
          </button>
          <button className="md-btn md-btn-text h-8" onClick={unlinkFolder}>
            Desvincular
          </button>
        </div>
      )}
      <EditorTabs
        tabs={tabs}
        activeId={project.activeFile}
        wrap={settings.wrap}
        canFormat={!!activeFile && canFormat(activeFile.kind, activeFile.name)}
        formatting={formatting}
        onOpen={openFile}
        onClose={closeTab}
        onFormat={format}
        onSearch={() => editor.current?.search()}
        onWrap={() => updateSettings({ wrap: !settings.wrap })}
        onIcon={() => openSymbols()}
        manifest={isExt && activeFile?.name === MANIFEST ? { mode: manifestMode, onMode: setMMode } : undefined}
        md={
          isMarkdown(activeFile)
            ? {
                mode: mdMode,
                onMode: (m) => {
                  setMdMode(m);
                  localStorage.setItem("poiesis:md-mode", m);
                },
              }
            : undefined
        }
      />
      <div className="relative min-h-0 flex-1">
        <div className={activeFile && activeFile.kind !== "asset" ? "flex h-full" : "hidden"}>
         <div className={(isMarkdown(activeFile) && mdMode === "view") || showManifestForm ? "hidden" : "h-full min-w-0 flex-1"}>
          <EditorContextMenu
            editor={editor}
            canFormat={!!activeFile && canFormat(activeFile.kind, activeFile.name)}
            onFormat={format}
            onRename={(s) => askRename(s)}
            onInspect={inspectAtCursor}
            onHighlight={(sel) => {
              if (!settings.console) updateSettings({ console: true });
              preview.current?.highlight(sel);
            }}
            onSearch={(q) => openSearch(q)}
            onPalette={() => setPalette("all")}
            onIcon={() => openSymbols()}
          >
            <CodeEditor
              ref={editor}
              file={activeFile}
              readOnly={!!folderStatus && folderStatus.state !== "linked"}
              settings={settings}
              dark={theme.dark}
              errorLine={errorLine}
              onChange={onChange}
              onCursor={setCursor}
              onRun={() => runUser()}
              onJump={jumpLoc}
              onOpenFile={(f) => openFile(f.id)}
              onToast={(m) => toast(m)}
            />
          </EditorContextMenu>
         </div>
         {showManifestForm && (
           <div className="h-full min-w-0 flex-1" style={{ background: "var(--md-surface-container-lowest)" }}>
             <ManifestForm
               src={activeFile!.content}
               files={project.files}
               problems={extReport?.problems ?? []}
               onChange={onManifestForm}
               onJson={openManifestAt}
               onIcons={() => setIconsOpen(true)}
               onFix={applyExtFix}
               onCreateFile={(n) => applyExtFix({ label: `Criar ${n}`, kind: "create", file: n, content: `// ${n}\n` })}
             />
           </div>
         )}
         {isMarkdown(activeFile) && mdMode !== "code" && (
           <div className={mdMode === "view" ? "h-full min-w-0 flex-1" : "h-full min-w-0 flex-1 border-l border-md-outline-v"} style={{ background: "var(--md-surface-container-lowest)" }}>
             <MarkdownView file={activeFile!} files={project.files} onOpenFile={openFile} />
           </div>
         )}
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
          <div className="flex h-full flex-col items-center justify-center gap-5 text-md-on-variant">
            <Logo size={64} className="opacity-50" />
            <div className="font-display text-[30px] italic text-md-on-surface">O que vem a ser?</div>
            <div className="grid gap-2 text-[12.5px]">
              {[
                ["Abrir arquivo", "Ctrl P"],
                ["Comandos", "Ctrl K"],
                ["Importar arquivos", "Ctrl O"],
                ["Executar", "Ctrl ↵"],
              ].map(([a, b]) => (
                <div key={a} className="flex w-60 items-center justify-between">
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
        <div className="md-pane h-full">
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
            picking={insp.picking}
            onPick={startPick}
            ext={isExt ? { role: extRole, size: extSize } : undefined}
            onExportHtml={exportHtml}
          />
        </div>
      }
      b={
        <div className="md-pane h-full">
{ui.bottom === "elements" ? (
            <InspectorPanel
              title={bottomTabs}
              st={insp}
              cmd={inspCmd}
              onClose={() => updateSettings({ console: false })}
              onGotoSource={gotoElementSource}
              onOpenRule={openRule}
              onCopy={copyText}
              onApply={applyInspector}
              onDiscard={() => {
                preview.current?.reload();
                toast("Mudanças temporárias descartadas");
              }}
            />
          ) : ui.bottom === "network" ? (
            <NetworkPanel
              title={bottomTabs}
              entries={netEntries}
              mocks={mocksParsed?.config ?? null}
              mockErrors={mocksParsed?.errors ?? []}
              preserve={!!ui.netPreserve}
              onPreserve={(v) => setUi((u: typeof ui) => ({ ...u, netPreserve: v }))}
              onClear={() => setNetLogs((m) => ({ ...m, [project.id]: [] }))}
              onClose={() => updateSettings({ console: false })}
              onExport={exportHar}
              onMocks={() => setMocksOpen(true)}
              onRequest={(prefill) => setReqDialog({ open: true, prefill })}
              onMockFrom={mockFrom}
              onJump={jumpInitiator}
              extNote={isExt}
            />
          ) : (
          <ConsolePanel
            title={bottomTabs}
            logs={logs}
            onClear={() => setLogs([])}
            onEval={evalCode}
            onJump={(file, line, col) => {
              const f = findFile(project.files, file);
              if (f) jumpTo(f.id, line, col);
            }}
            onClose={() => updateSettings({ console: false })}
            knownFile={(n) => !!findFile(project.files, n)}
          />
          )}
        </div>
      }
    />
  );

  return (
    <TooltipProvider delayDuration={450} skipDelayDuration={150}>
      <div className="flex h-full">
        <NavRail
          panel={settings.panel}
          open={settings.sidebar}
          onSelect={selectPanel}
          onSettings={() => setSettingsOpen(true)}
          onHelp={() => setShortcutsOpen(true)}
          companion={companionEl("rail")}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <TopAppBar
            project={project}
            autoRun={settings.autoRun}
            layout={settings.layout}
            busy={busy}
            onRun={() => runUser()}
            onAutoRun={() => updateSettings({ autoRun: !settings.autoRun })}
            onLayout={(l) => updateSettings({ layout: l })}
            onNew={createProject}
            onRename={(name) => updateProject((p) => ({ ...p, name }))}
            onDuplicate={duplicateProject}
            onDelete={deleteProject}
            onImportFiles={() => pickFiles(null)}
            onImportFolder={() => pickFolder(null)}
            onExportHtml={exportHtml}
            onExportZip={exportZip}
            onPalette={() => setPalette("all")}
            companion={companionEl("top")}
            music={
              <MusicButton
                state={music.state}
                error={music.error}
                volume={settings.musicVolume}
                autoPause={settings.musicAutoPause}
                onToggle={music.toggle}
                onVolume={(v) => updateSettings({ musicVolume: v })}
                onAutoPause={(v) => updateSettings({ musicAutoPause: v })}
              />
            }
          />

          <div className="flex min-h-0 flex-1 pr-2">
            {settings.sidebar && (
              <aside className="md-pane rise mr-2 w-[268px] shrink-0">
                {settings.panel === "files" && (
                  <Explorer
                    projectName={project.name}
                    files={project.files}
                    folders={project.folders ?? []}
                    activeId={project.activeFile}
                    entryId={project.entry}
                    onOpen={openFile}
                    onCreate={createFile}
                    onCreateFolder={createFolder}
                    onRename={renameFile}
                    onRenameFolder={renameFolder}
                    onDelete={deleteFile}
                    onDeleteFolder={deleteFolder}
                    onDuplicate={duplicateFile}
                    onSetEntry={(id) => {
                      updateProject((p) => ({ ...p, entry: id }));
                      setPreviewPage(id);
                    }}
                    onDownload={downloadFile}
                    onMove={moveFile}
                    onMoveFolder={moveFolder}
                    onAddFiles={(d) => pickFiles(d)}
                    onAddFolder={(d) => pickFolder(d)}
                    onDropExternal={async (d, dt) => receiveRef.current(await collectDrop(dt), d)}
                    onCopy={(t) => {
                      navigator.clipboard.writeText(t);
                      toast.success("Caminho copiado", { description: t });
                    }}
                  />
                )}
                {settings.panel === "search" && <SearchPanel files={project.files} seed={searchSeed} onJump={jumpTo} onReplaceAll={replaceAll} />}
                {settings.panel === "projects" && (
                  <ProjectsPanel
                    projects={ws.order.map((id) => ws.projects[id])}
                    currentId={project.id}
                    onSwitch={switchProject}
                    onNew={createProject}
                    linked={Object.fromEntries(Object.entries(folder.status).map(([id, st]) => [id, st.name]))}
                    folders={folder.enabled ? { onOpen: openLocalFolder, onLink: linkCurrentFolder, currentLinked: !!folderStatus } : undefined}
                  />
                )}
                {settings.panel === "history" && (
                  <HistoryPanel
                    project={project}
                    projectIds={ws.order}
                    tick={historyTick}
                    onCheckpoint={(label, note) =>
                      checkpoint("manual", project, { label, note }).then((r) => r && toast.success("Ponto de restauração criado", { description: label || undefined }))
                    }
                    onCompare={setCompareRev}
                    onExport={exportProjectHistory}
                    onImport={() => historyInput.current?.click()}
                    onCleanOrphans={() => deleteOrphans(ws.order).then(() => setHistoryTick((t) => t + 1))}
                    onChanged={() => setHistoryTick((t) => t + 1)}
                  />
                )}
                {settings.panel === "extension" && (
                  <ExtensionPanel
                    project={project}
                    isExt={isExt}
                    report={extReport}
                    onNew={() => setExtNew(true)}
                    onConvert={convertToExtension}
                    onOpen={openExtFile}
                    onPreview={previewExtPage}
                    onExport={() => exportExtension()}
                    onIcons={() => setIconsOpen(true)}
                    onForm={openManifestForm}
                    onFix={applyExtFix}
                    onSim={() => setChromeOpen(true)}
                    simCount={chromeParsed?.config.messages.filter((m) => m.enabled).length ?? 0}
                  />
                )}
                {settings.panel === "themes" && <ThemesPanel current={settings.theme} onPick={(id) => updateSettings({ theme: id })} />}
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
            folder={folderStatus}
            onFolderSync={() => project && folder.syncNow(project.id)}
            onFolderReconnect={() => project && folder.reconnect(project.id).then((ok) => !ok && toast.error("Ainda sem acesso à pasta"))}
            onFolderUnlink={unlinkFolder}
          />
        </div>

        {/* entradas ocultas */}
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            receive(fromInput(e.target.files), importDir.current);
            importDir.current = null;
            e.target.value = "";
          }}
        />
        <input
          ref={folderInput}
          type="file"
          hidden
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
          onChange={(e) => {
            receive(fromInput(e.target.files), importDir.current);
            importDir.current = null;
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
          <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-[var(--md-scrim)]">
            <div className="rise flex flex-col items-center gap-3 rounded-[28px] bg-md-high px-14 py-10 shadow-[var(--md-elev-3)]">
              <Icon name="move_to_inbox" size={44} className="text-md-primary" />
              <div className="font-display text-[30px] italic text-md-on-surface">Solte para dar forma</div>
              <div className="text-[12.5px] text-md-on-variant">HTML, CSS, JS, imagens ou uma pasta inteira — ou solte numa pasta da barra lateral</div>
            </div>
          </div>
        )}

        <ImportDialog
          files={pendingImport?.files ?? null}
          suggested={pendingImport?.name ?? ""}
          currentName={project.name}
          folders={folders}
          onCancel={() => setPendingImport(null)}
          onConfirm={confirmImport}
        />
        <RenameDialog target={renameTarget} onCancel={() => setRenameTarget(null)} onConfirm={doRename} />
        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          settings={settings}
          onChange={updateSettings}
          onBackup={backup}
          onRestore={() => backupInput.current?.click()}
        />
        <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
        <Dialog
          open={!!linkAsk}
          onOpenChange={(o) => {
            if (!o) {
              decideRef.current?.(null);
              decideRef.current = null;
              setLinkAsk(null);
            }
          }}
        >
          <DialogContent className="max-w-[500px]">
            <DialogHeader>
              <DialogTitle>A pasta "{linkAsk}" já tem arquivos</DialogTitle>
              <DialogDescription className="leading-relaxed">Escolha qual lado vale. O que for substituído fica salvo no histórico antes.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              {(
                [
                  ["write", "upload", "Gravar este projeto na pasta", "Os arquivos do projeto vão para a pasta (os de mesmo nome são sobrescritos). Arquivos que só existem na pasta entram no projeto."],
                  ["read", "download", "Trazer os arquivos da pasta", "O conteúdo do projeto é trocado pelo da pasta."],
                ] as const
              ).map(([mode, icon, title, desc]) => (
                <button
                  key={mode}
                  className="md-item md-card-outlined h-auto items-start gap-3 rounded-xl p-3 text-left"
                  onClick={() => {
                    decideRef.current?.(mode);
                    decideRef.current = null;
                    setLinkAsk(null);
                  }}
                >
                  <Icon name={icon} size={20} className="mt-0.5 text-md-primary" />
                  <span>
                    <span className="block text-[13.5px] font-medium text-md-on-surface">{title}</span>
                    <span className="block text-[12px] leading-snug text-md-on-variant">{desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
        <RequestDialog open={reqDialog.open} prefill={reqDialog.prefill} onOpenChange={(o) => setReqDialog((r) => ({ ...r, open: o }))} onSend={sendRequest} />
        <MocksDialog
          open={mocksOpen}
          config={mocksParsed?.config ?? null}
          errors={mocksParsed?.errors ?? []}
          files={project.files.filter((f) => f.kind !== "asset" && f.name !== MOCKS_FILE).map((f) => f.name)}
          onOpenChange={setMocksOpen}
          onSave={saveMocks}
          onOpenFile={openMocksFile}
        />
        <ChromeSimDialog
          open={chromeOpen}
          onOpenChange={setChromeOpen}
          config={chromeParsed?.config ?? { version: 1, storage: { local: {}, sync: {} }, tabs: [], messages: [] }}
          fileErrors={chromeParsed?.errors ?? []}
          current={project ? (extStorage.current[project.id] ?? null) : null}
          onSave={saveChrome}
          onOpenFile={openChromeFile}
        />
        <NewExtensionDialog open={extNew} onOpenChange={setExtNew} onCreate={createExtension} />
        <IconsDialog open={iconsOpen} onOpenChange={setIconsOpen} images={project.files.filter((f) => (f.kind === "asset" && /^image\//.test(f.mime ?? "")) || /\.svg$/i.test(f.name))} onApply={applyIcons} />
        <ExportExtensionDialog
          open={extExport}
          onOpenChange={setExtExport}
          problems={extReport?.problems ?? []}
          count={extReport ? extensionZipFiles(project, extReport.manifest ?? {}).include.length : 0}
          excluded={extReport && extExport ? extensionZipFiles(project, extReport.manifest ?? {}).excluded : []}
          onExport={() => exportExtension(true)}
          onOpenProblem={(p: ExtProblem) => {
            setExtExport(false);
            openExtFile(p.file, p.from);
          }}
        />
        <CompareDialog
          open={!!compareRev}
          project={project}
          revision={compareRev}
          onOpenChange={(o) => !o && setCompareRev(null)}
          onRestoreProject={(rev) => restoreFrom(rev)}
          onRestoreFiles={(rev, paths) => restoreFrom(rev, paths)}
          onApplyContent={applyChunks}
        />
        <input
          ref={historyInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            importProjectHistory(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <SymbolPicker
          open={!!symbolPicker}
          onOpenChange={(o) => !o && setSymbolPicker(null)}
          lang={symbolPicker?.lang ?? "html"}
          current={symbolPicker?.current ?? null}
          onPick={insertSymbol}
          onClosed={() => editor.current?.focus()}
          onCopy={(t) => {
            navigator.clipboard.writeText(t);
            toast.success("Código copiado");
          }}
        />
        <CommandPalette open={!!palette} mode={palette ?? "all"} onOpenChange={(o) => !o && setPalette(null)} files={project.files} commands={commands} onOpenFile={openFile} />
        <Toaster
          theme={theme.dark ? "dark" : "light"}
          position="bottom-center"
          offset={40}
          toastOptions={{
            style: {
              background: "var(--md-inverse-surface)",
              color: "var(--md-inverse-on-surface)",
              border: "none",
              borderRadius: 8,
              fontFamily: "var(--font-ui)",
              fontSize: 13,
              boxShadow: "var(--md-elev-3)",
            },
            actionButtonStyle: { background: "transparent", color: "var(--md-inverse-primary)", fontWeight: 600 },
          }}
        />
      </div>
    </TooltipProvider>
  );
}
