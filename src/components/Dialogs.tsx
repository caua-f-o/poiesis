// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
import { useEffect, useState } from "react";
import type { PFile, Settings } from "@/lib/types";
import { THEMES } from "@/lib/themes";
import { Icon } from "./Icon";
import { fileIcon } from "./fileIcon";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { CompanionArt } from "./Companion";
import { Slider } from "@/components/ui/slider";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatBytes, storageUsage, type StorageUsage } from "@/lib/db";
import { folderSupported } from "@/lib/localfs";

/* ---------------- preferências ---------------- */

function Row({ icon, title, hint, children }: { icon: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 py-3">
      <Icon name={icon} size={21} className="text-md-on-variant" />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] text-md-on-surface">{title}</div>
        {hint && <div className="text-[12px] leading-snug text-md-on-variant">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function StorageRow({ open }: { open: boolean }) {
  const [u, setU] = useState<StorageUsage | null>(null);
  useEffect(() => {
    if (open) storageUsage().then(setU);
  }, [open]);
  if (!u) return null;
  const pct = u.quota ? Math.min(100, (u.usage / u.quota) * 100) : 0;
  return (
    <Row icon="database" title="Espaço usado no navegador" hint={`${formatBytes(u.usage)}${u.quota ? ` de ${formatBytes(u.quota)} disponíveis` : ""} — projetos, histórico e preview`}>
      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-md-high" role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Espaço usado">
        <div className={cn("h-full rounded-full", pct > 85 ? "bg-[var(--rose)]" : "bg-md-primary")} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
    </Row>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onChange,
  onBackup,
  onRestore,
}: {
  open: boolean;
  onOpenChange(o: boolean): void;
  settings: Settings;
  onChange(p: Partial<Settings>): void;
  onBackup(): void;
  onRestore(): void;
}) {
  const theme = THEMES.find((t) => t.id === settings.theme) ?? THEMES[0];
  const folderOk = folderSupported();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] gap-0 p-0">
        <DialogHeader className="px-6 pb-2 pt-6">
          <DialogTitle>Preferências</DialogTitle>
          <DialogDescription>Valem para todos os projetos.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[62vh] divide-y divide-md-outline-v overflow-y-auto px-6">
          <Row icon="palette" title="Tema" hint={theme.note}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="md-btn md-btn-outlined h-9 gap-1 pr-3 text-md-on-surface">
                  <span className="h-3 w-3 rounded-full" style={{ background: theme.ui.primary }} />
                  {theme.name}
                  <Icon name="arrow_drop_down" size={20} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                {THEMES.map((t) => (
                  <DropdownMenuItem key={t.id} onSelect={() => onChange({ theme: t.id })}>
                    <span className="flex h-4 w-7 overflow-hidden rounded-full">
                      <span className="flex-1" style={{ background: t.syn.bg }} />
                      <span className="flex-1" style={{ background: t.ui.primary }} />
                      <span className="flex-1" style={{ background: t.syn.tag }} />
                    </span>
                    {t.name}
                    {t.id === settings.theme && <Icon name="check" size={18} className="ml-auto !text-md-primary" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </Row>
          <Row icon="format_size" title="Tamanho da fonte" hint={`${settings.fontSize}px`}>
            <Slider className="w-40" min={11} max={20} step={0.5} value={[settings.fontSize]} onValueChange={([v]) => onChange({ fontSize: v })} />
          </Row>
          <Row icon="wrap_text" title="Quebra de linha">
            <Switch checked={settings.wrap} onCheckedChange={(v) => onChange({ wrap: v })} />
          </Row>
          <Row icon="keyboard_tab" title="Indentação">
            <div className="md-seg">
              {[2, 4].map((n) => (
                <button key={n} data-on={settings.tabSize === n} onClick={() => onChange({ tabSize: n })} className="!px-3">
                  {settings.tabSize === n && <Icon name="check" size={16} />}
                  {n} espaços
                </button>
              ))}
            </div>
          </Row>
          <Row icon="bolt" title="Emmet" hint="ul>li*3 + Tab vira lista; ! + Tab vira esqueleto HTML">
            <Switch checked={settings.emmet} onCheckedChange={(v) => onChange({ emmet: v })} />
          </Row>
          <Row icon="menu_book" title="Definições ao passar o mouse" hint="Mostra o que é cada tag, propriedade ou classe sob o cursor">
            <Switch checked={settings.hoverDocs} onCheckedChange={(v) => onChange({ hoverDocs: v })} />
          </Row>
          <Row icon="timer" title="Atraso do modo ao vivo" hint={`${settings.delay} ms depois da última tecla`}>
            <Slider className="w-40" min={100} max={2000} step={50} value={[settings.delay]} onValueChange={([v]) => onChange({ delay: v })} />
          </Row>
          <Row icon="merge" title="Injetar CSS/JS soltos" hint="Arquivos não referenciados no HTML entram no preview automaticamente">
            <Switch checked={settings.autoInject} onCheckedChange={(v) => onChange({ autoInject: v })} />
          </Row>
          <Row icon="mop" title="Limpar console ao executar">
            <Switch checked={settings.clearOnRun} onCheckedChange={(v) => onChange({ clearOnRun: v })} />
          </Row>
          <div className="eyebrow pb-1 pt-4">Pasta no computador</div>
          <Row
            icon="computer"
            title="Editar pastas do computador"
            hint={
              folderOk
                ? "Abre uma pasta real e grava as edições direto nos arquivos. O navegador pede permissão pasta por pasta."
                : "Este navegador não permite acessar pastas (precisa de Chrome, Edge ou outro Chromium recente)."
            }
          >
            <Switch checked={settings.localFolders && folderOk} disabled={!folderOk} onCheckedChange={(v) => onChange({ localFolders: v })} />
          </Row>
          {settings.localFolders && folderOk && (
            <div className="flex items-start gap-4 py-3">
              <Icon name="visibility_off" size={21} className="mt-1 text-md-on-variant" />
              <label className="min-w-0 flex-1 text-[13.5px] text-md-on-surface">
                Ignorar ao ler pastas
                <input
                  defaultValue={settings.folderIgnore}
                  onBlur={(e) => onChange({ folderIgnore: e.target.value })}
                  spellCheck={false}
                  className="mt-1 h-9 w-full rounded-lg border border-md-outline bg-transparent px-3 font-code text-[12.5px] text-md-on-surface outline-none focus:border-md-primary"
                />
                <span className="mt-1 block text-[12px] leading-snug text-md-on-variant">Separados por vírgula; aceita * (ex.: *.log). O .gitignore da pasta também vale.</span>
              </label>
            </div>
          )}
          <div className="eyebrow pb-1 pt-4">Companheiro e música</div>
          <div className="grid grid-cols-3 gap-2 py-2" role="radiogroup" aria-label="Companheiro">
            {(
              [
                ["polen", "Pólen", "Caloroso e curioso. Celebra a criação com saltinhos."],
                ["lumen", "Lúmen", "Serena e observadora. Brilha com calma, perto do foco."],
                ["nenhum", "Nenhum", "Sem companheiro na tela."],
              ] as const
            ).map(([id, name, desc]) => (
              <button
                key={id}
                role="radio"
                aria-checked={settings.companion === id}
                onClick={() => onChange({ companion: id })}
                className={cn("md-item h-auto flex-col items-center gap-1 rounded-2xl p-3 text-center", settings.companion === id ? "bg-md-secondary-c outline outline-2 outline-md-primary" : "md-card-outlined")}
              >
                <span className="flex h-14 w-14 items-center justify-center">
                  {id === "nenhum" ? <Icon name="block" size={28} className="text-md-outline" /> : <CompanionArt id={id} pose="idle" level="foco" bloom={!!settings.companionMarks.firstExport} />}
                </span>
                <span className="text-[13px] font-semibold text-md-on-surface">{name}</span>
                <span className="text-[11px] leading-snug text-md-on-variant">{desc}</span>
              </button>
            ))}
          </div>
          {settings.companion !== "nenhum" && (
            <>
              <Row
                icon="motion_mode"
                title="Quanto ele se mexe"
                hint={
                  settings.companionLevel === "foco"
                    ? "Foco: parado, sem reações nem partículas (só um carinho quando você clica)"
                    : settings.companionLevel === "discreto"
                      ? "Discreto: respira e reage só ao que importa (criar, executar, erro, exportar)"
                      : "Vivo: acompanha a digitação e todas as reações, com limites de frequência"
                }
              >
                <div className="md-seg" role="radiogroup" aria-label="Nível de animação">
                  {(
                    [
                      ["foco", "Foco"],
                      ["discreto", "Discreto"],
                      ["vivo", "Vivo"],
                    ] as const
                  ).map(([k, label]) => (
                    <button key={k} role="radio" aria-checked={settings.companionLevel === k} data-on={settings.companionLevel === k} onClick={() => onChange({ companionLevel: k })} className="!px-2.5 text-[12px]">
                      {label}
                    </button>
                  ))}
                </div>
              </Row>
              <Row icon="pin_drop" title="Onde fica" hint="Nunca na frente do código nem do preview">
                <div className="md-seg" role="radiogroup" aria-label="Posição do companheiro">
                  {(
                    [
                      ["rail", "Barra lateral"],
                      ["top", "Barra superior"],
                    ] as const
                  ).map(([k, label]) => (
                    <button key={k} role="radio" aria-checked={settings.companionPlace === k} data-on={settings.companionPlace === k} onClick={() => onChange({ companionPlace: k })} className="!px-2.5 text-[12px]">
                      {label}
                    </button>
                  ))}
                </div>
              </Row>
              {!!settings.companionMarks.firstExport && (
                <Row icon="local_florist" title="Marcos" hint={`Primeira exportação em ${new Date(settings.companionMarks.firstExport).toLocaleDateString("pt-BR")} — ${settings.companion === "polen" ? "Pólen ganhou uma flor" : "Lúmen ganhou uma estrela"}. Só enfeite, fica neste navegador.`}>
                  <button className="md-btn md-btn-text" onClick={() => onChange({ companionMarks: {} })}>
                    Redefinir
                  </button>
                </Row>
              )}
            </>
          )}
          <Row icon="music_note" title="Música de foco" hint={`Volume ${Math.round(settings.musicVolume * 100)}. Toque pelo botão de fone na barra superior.`}>
            <label className="flex items-center gap-2 text-[12.5px] text-md-on-surface">
              <Switch checked={settings.musicAutoPause} onCheckedChange={(v) => onChange({ musicAutoPause: v })} aria-label="Pausar a música com a aba escondida" />
              Pausar com a aba escondida
            </label>
          </Row>
          <div className="eyebrow pb-1 pt-4">Histórico local</div>
          <Row icon="history" title="Versão automática" hint={settings.history.interval ? `Depois de ${settings.history.interval} s sem editar, se algo mudou` : "Desligada — só pontos manuais e antes de operações"}>
            <div className="md-seg">
              {[0, 30, 45, 60, 120].map((n) => (
                <button key={n} data-on={settings.history.interval === n} onClick={() => onChange({ history: { ...settings.history, interval: n } })} className="!px-2.5 text-[12px]">
                  {n === 0 ? "Off" : n < 60 ? `${n}s` : `${n / 60}min`}
                </button>
              ))}
            </div>
          </Row>
          <Row icon="auto_delete" title="Versões automáticas por projeto" hint="As mais antigas saem primeiro; pontos manuais e fixados ficam">
            <div className="md-seg">
              {[50, 150, 500].map((n) => (
                <button key={n} data-on={settings.history.maxAuto === n} onClick={() => onChange({ history: { ...settings.history, maxAuto: n } })} className="!px-2.5 text-[12px]">
                  {n}
                </button>
              ))}
            </div>
          </Row>
          <Row icon="photo_size_select_large" title="Arquivos grandes nas versões automáticas" hint="Acima disso, o arquivo só entra em pontos manuais e antes de operações">
            <div className="md-seg">
              {[1, 5, 20].map((n) => (
                <button
                  key={n}
                  data-on={settings.history.maxFileSize === n * 1024 * 1024}
                  onClick={() => onChange({ history: { ...settings.history, maxFileSize: n * 1024 * 1024 } })}
                  className="!px-2.5 text-[12px]"
                >
                  {n} MB
                </button>
              ))}
            </div>
          </Row>
          <StorageRow open={open} />
          <Row icon="backup" title="Backup" hint="Todos os projetos num .json">
            <div className="flex gap-1">
              <button className="md-btn md-btn-text" onClick={onBackup}>
                Salvar
              </button>
              <button className="md-btn md-btn-text" onClick={onRestore}>
                Restaurar
              </button>
            </div>
          </Row>
        </div>
        <div className="flex items-center gap-3 px-6 py-4 text-[12px] leading-relaxed text-md-on-variant">
          <span className="font-display text-[17px] italic text-md-on-surface">ποίησις</span>
          <span>— para os gregos, o ato de trazer à existência o que antes não era.</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- importação ---------------- */

export type ImportMode = "new" | "add" | "merge";

export function ImportDialog({
  files,
  suggested,
  currentName,
  folders,
  onCancel,
  onConfirm,
}: {
  files: PFile[] | null;
  suggested: string;
  currentName: string;
  folders: string[];
  onCancel(): void;
  onConfirm(mode: ImportMode, opts: { name: string; dir: string }): void;
}) {
  const [mode, setMode] = useState<ImportMode>("add");
  const [name, setName] = useState(suggested);
  const [dir, setDir] = useState("");
  useEffect(() => {
    if (files) {
      setName(suggested);
      setDir("");
      setMode("add");
    }
  }, [files, suggested]);

  const count = (k: string) => files?.filter((f) => f.kind === k).length ?? 0;
  const groups = [
    ["html", "HTML"],
    ["css", "CSS"],
    ["js", "JS"],
    ["asset", "Mídia"],
  ] as const;

  const options: { id: ImportMode; icon: string; title: string; desc: string }[] = [
    { id: "add", icon: "add_circle", title: `Adicionar a “${currentName}”`, desc: "Mantém tudo que já existe. Nomes repetidos ganham sufixo (-2, -3…)." },
    { id: "new", icon: "create_new_folder", title: "Criar um projeto novo", desc: "Os arquivos viram um projeto separado." },
    { id: "merge", icon: "merge", title: `Mesclar em “${currentName}”`, desc: "Arquivos com o mesmo caminho são substituídos." },
  ];

  return (
    <Dialog open={!!files} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-[540px]">
        <DialogHeader>
          <Icon name="move_to_inbox" size={26} className="mb-1 text-md-primary" />
          <DialogTitle>Trazer para dentro</DialogTitle>
          <DialogDescription>
            {files?.length} {files?.length === 1 ? "arquivo pronto" : "arquivos prontos"}. As ligações entre HTML, CSS e JS são resolvidas automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          {groups.map(([k, label]) =>
            count(k) ? (
              <span key={k} className="md-chip pointer-events-none h-6 px-2.5">
                {count(k)} {label}
              </span>
            ) : null
          )}
        </div>
        <div className="max-h-32 overflow-y-auto rounded-xl bg-md-container py-1.5">
          {files?.map((f) => {
            const { icon, color } = fileIcon(f);
            return (
              <div key={f.id} className="flex items-center gap-2 px-3 py-0.5">
                <span className="msr" style={{ fontSize: 16, color }}>
                  {icon}
                </span>
                <span className="truncate font-code text-[11.5px] text-md-on-variant">{f.name}</span>
              </div>
            );
          })}
        </div>

        <div role="radiogroup" className="grid gap-1">
          {options.map((o) => (
            <button
              key={o.id}
              role="radio"
              aria-checked={mode === o.id}
              onClick={() => setMode(o.id)}
              className={cn("md-item h-auto items-start rounded-2xl px-3 py-2.5", mode === o.id && "bg-md-secondary-c")}
            >
              <Icon name={mode === o.id ? "radio_button_checked" : "radio_button_unchecked"} size={21} className={mode === o.id ? "text-md-primary" : ""} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-medium text-md-on-surface">{o.title}</span>
                <span className="block text-[12px] leading-snug text-md-on-variant">{o.desc}</span>
              </span>
              <Icon name={o.icon} size={20} className="mt-0.5" />
            </button>
          ))}
        </div>

        {mode === "new" && (
          <label className="grid gap-1.5">
            <span className="text-[12px] font-medium text-md-on-variant">Nome do projeto</span>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="md-field" />
          </label>
        )}
        {mode !== "new" && (
          <label className="grid gap-1.5">
            <span className="text-[12px] font-medium text-md-on-variant">Colocar em</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="md-field flex items-center gap-2 text-left">
                  <Icon name={dir ? "folder" : "home_storage"} size={18} className="text-md-primary" />
                  <span className="flex-1 font-code text-[12.5px]">{dir || "raiz do projeto"}</span>
                  <Icon name="arrow_drop_down" size={20} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-64 w-[var(--radix-dropdown-menu-trigger-width)]">
                {["", ...folders].map((d) => (
                  <DropdownMenuItem key={d || "/"} onSelect={() => setDir(d)} className="font-code text-[12px]">
                    <Icon name={d ? "folder" : "home_storage"} size={18} /> {d || "raiz do projeto"}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </label>
        )}

        <DialogFooter>
          <button className="md-btn md-btn-text" onClick={onCancel}>
            Cancelar
          </button>
          <button className="md-btn md-btn-filled" onClick={() => onConfirm(mode, { name: name.trim() || suggested, dir })}>
            {mode === "new" ? "Criar projeto" : mode === "add" ? "Adicionar" : "Mesclar"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- renomear símbolo ---------------- */

export function RenameDialog({
  target,
  onCancel,
  onConfirm,
}: {
  target: { label: string; name: string; count: number } | null;
  onCancel(): void;
  onConfirm(newName: string): void;
}) {
  const [v, setV] = useState("");
  useEffect(() => {
    if (target) setV(target.name);
  }, [target]);
  const valid = /^-?[_a-zA-Z -￿][\w -￿-]*$/.test(v.replace(/^--/, "a"));
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <Icon name="edit_note" size={26} className="mb-1 text-md-primary" />
          <DialogTitle>
            Renomear <span className="font-code text-[19px] text-md-primary">{target?.label}</span>
          </DialogTitle>
          <DialogDescription>
            Atualiza {target?.count ?? 0} ocorrência{target?.count === 1 ? "" : "s"} em HTML, CSS e JavaScript de todo o projeto.
          </DialogDescription>
        </DialogHeader>
        <input
          autoFocus
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && valid && v !== target?.name && onConfirm(v)}
          onFocus={(e) => e.currentTarget.select()}
          className="md-field font-code"
        />
        <DialogFooter>
          <button className="md-btn md-btn-text" onClick={onCancel}>
            Cancelar
          </button>
          <button className="md-btn md-btn-filled" disabled={!valid || v === target?.name} onClick={() => onConfirm(v)}>
            Renomear
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- atalhos ---------------- */

const SHORTCUTS: [string, [string, string][]][] = [
  [
    "Geral",
    [
      ["Executar", "Ctrl+Enter / Ctrl+S"],
      ["Paleta de comandos", "Ctrl+K"],
      ["Abrir arquivo", "Ctrl+P"],
      ["Importar arquivos", "Ctrl+O"],
      ["Buscar no projeto", "Ctrl+Shift+F"],
      ["Barra lateral / console", "Ctrl+B / Ctrl+J"],
      ["Alternar layout", "Ctrl+\\"],
      ["Recarregar preview", "Ctrl+R"],
    ],
  ],
  [
    "Editor",
    [
      ["Sugestões", "Ctrl+Espaço"],
      ["Definição do símbolo", "Alt+F1"],
      ["Ir para definição", "F12 / Ctrl+clique"],
      ["Renomear no projeto", "F2"],
      ["Formatar", "Shift+Alt+F"],
      ["Buscar / substituir", "Ctrl+F / Ctrl+H"],
      ["Comentar", "Ctrl+/"],
      ["Selecionar próxima ocorrência", "Ctrl+D"],
      ["Duplicar / mover linha", "Shift+Alt+↓ / Alt+↑↓"],
      ["Quebra de linha", "Alt+Z"],
      ["Expandir Emmet", "Tab"],
      ["Envolver com Emmet", "Ctrl+Shift+A"],
      ["Inserir / trocar ícone", "Alt+I"],
      ["Correções rápidas", "Ctrl+. (ou clique no sublinhado)"],
      ["Próximo / anterior problema", "F8 / Shift+F8"],
    ],
  ],
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange(o: boolean): void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[620px]">
        <DialogHeader>
          <DialogTitle>Atalhos</DialogTitle>
        </DialogHeader>
        <div className="grid gap-6 sm:grid-cols-2">
          {SHORTCUTS.map(([group, list]) => (
            <div key={group}>
              <div className="eyebrow mb-2">{group}</div>
              {list.map(([a, k]) => (
                <div key={a} className="flex items-center justify-between gap-3 border-b border-md-outline-v py-1.5 text-[12.5px]">
                  <span>{a}</span>
                  <span className="shrink-0 font-code text-[11px] text-md-on-variant">{k}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- paleta de comandos ---------------- */

export interface Cmd {
  id: string;
  label: string;
  icon: string;
  shortcut?: string;
  group: string;
  run(): void;
}

export function CommandPalette({
  open,
  mode,
  onOpenChange,
  files,
  commands,
  onOpenFile,
}: {
  open: boolean;
  mode: "files" | "all";
  onOpenChange(o: boolean): void;
  files: PFile[];
  commands: Cmd[];
  onOpenFile(id: string): void;
}) {
  const groups = [...new Set(commands.map((c) => c.group))];
  const close = (fn: () => void) => {
    onOpenChange(false);
    setTimeout(fn, 10);
  };
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={mode === "files" ? "Ir para arquivo…" : "Digite um comando ou nome de arquivo…"} />
      <CommandList>
        <CommandEmpty>Nada encontrado.</CommandEmpty>
        <CommandGroup heading="Arquivos">
          {files.map((f) => {
            const { icon, color } = fileIcon(f);
            return (
              <CommandItem key={f.id} value={"arquivo " + f.name} onSelect={() => close(() => onOpenFile(f.id))}>
                <span className="msr" style={{ fontSize: 18, color }}>
                  {icon}
                </span>
                <span className="font-code text-[12.5px]">{f.name}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
        {mode === "all" &&
          groups.map((g) => (
            <div key={g}>
              <CommandSeparator />
              <CommandGroup heading={g}>
                {commands
                  .filter((c) => c.group === g)
                  .map((c) => (
                    <CommandItem key={c.id} value={c.group + " " + c.label} onSelect={() => close(c.run)}>
                      <Icon name={c.icon} size={19} className="text-md-on-variant" />
                      {c.label}
                      {c.shortcut && <CommandShortcut>{c.shortcut}</CommandShortcut>}
                    </CommandItem>
                  ))}
              </CommandGroup>
            </div>
          ))}
      </CommandList>
    </CommandDialog>
  );
}
