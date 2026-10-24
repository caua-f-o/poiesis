import { useState } from "react";
import type { PFile, Settings } from "@/lib/types";
import { Icon } from "./Icon";
import { fileIcon } from "./fileIcon";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
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
import { cn } from "@/lib/utils";

/* ---------------- preferências ---------------- */

function Row({ icon, title, hint, children }: { icon: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <Icon name={icon} size={18} className="text-[var(--paper-3)]" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-[var(--paper)]">{title}</div>
        {hint && <div className="text-[11.5px] leading-snug text-[var(--paper-3)]">{hint}</div>}
      </div>
      {children}
    </div>
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[460px] border-[var(--line-2)] bg-[var(--ink-2)] p-0">
        <DialogHeader className="border-b border-[var(--line)] px-5 pb-3 pt-5">
          <DialogTitle className="font-display text-[24px] font-normal italic">Preferências</DialogTitle>
          <DialogDescription className="text-[12px]">Ajustes valem para todos os projetos.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] divide-y divide-[var(--line)] overflow-y-auto px-5">
          <Row icon="format_size" title="Tamanho da fonte" hint={`${settings.fontSize}px`}>
            <Slider className="w-36" min={11} max={20} step={0.5} value={[settings.fontSize]} onValueChange={([v]) => onChange({ fontSize: v })} />
          </Row>
          <Row icon="wrap_text" title="Quebra de linha">
            <Switch checked={settings.wrap} onCheckedChange={(v) => onChange({ wrap: v })} />
          </Row>
          <Row icon="keyboard_tab" title="Indentação">
            <div className="flex rounded-md bg-[var(--ink-0)] p-0.5">
              {[2, 4].map((n) => (
                <button key={n} className="tool h-6 px-2.5" data-on={settings.tabSize === n} onClick={() => onChange({ tabSize: n })}>
                  {n} espaços
                </button>
              ))}
            </div>
          </Row>
          <Row icon="bolt" title="Emmet" hint="ul>li*3 + Tab vira lista; ! + Tab vira esqueleto HTML">
            <Switch checked={settings.emmet} onCheckedChange={(v) => onChange({ emmet: v })} />
          </Row>
          <Row icon="timer" title="Atraso do modo ao vivo" hint={`${settings.delay} ms depois da última tecla`}>
            <Slider className="w-36" min={100} max={2000} step={50} value={[settings.delay]} onValueChange={([v]) => onChange({ delay: v })} />
          </Row>
          <Row icon="merge" title="Injetar CSS/JS soltos" hint="Arquivos não referenciados no HTML entram no preview automaticamente">
            <Switch checked={settings.autoInject} onCheckedChange={(v) => onChange({ autoInject: v })} />
          </Row>
          <Row icon="mop" title="Limpar console ao executar">
            <Switch checked={settings.clearOnRun} onCheckedChange={(v) => onChange({ clearOnRun: v })} />
          </Row>
          <Row icon="backup" title="Backup" hint="Todos os projetos num .json">
            <div className="flex gap-1">
              <button className="tool border border-[var(--line-2)] px-2" onClick={onBackup}>
                <Icon name="download" size={15} /> Salvar
              </button>
              <button className="tool border border-[var(--line-2)] px-2" onClick={onRestore}>
                <Icon name="upload" size={15} /> Restaurar
              </button>
            </div>
          </Row>
        </div>
        <div className="border-t border-[var(--line)] px-5 py-3 text-[11.5px] leading-relaxed text-[var(--paper-3)]">
          <span className="font-display text-[14px] italic text-[var(--paper-2)]">ποίησις</span> — para os gregos, o ato de trazer à existência
          o que antes não era. Código vira forma.
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- importação ---------------- */

export function ImportDialog({
  files,
  suggested,
  currentName,
  onCancel,
  onConfirm,
}: {
  files: PFile[] | null;
  suggested: string;
  currentName: string;
  onCancel(): void;
  onConfirm(mode: "new" | "merge", name: string): void;
}) {
  const [name, setName] = useState(suggested);
  const [lastSuggested, setLastSuggested] = useState(suggested);
  if (suggested !== lastSuggested) {
    setLastSuggested(suggested);
    setName(suggested);
  }
  const count = (k: string) => files?.filter((f) => f.kind === k).length ?? 0;
  const groups = [
    ["html", "HTML"],
    ["css", "CSS"],
    ["js", "JS"],
    ["asset", "Mídia"],
  ] as const;

  return (
    <Dialog open={!!files} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-[480px] border-[var(--line-2)] bg-[var(--ink-2)]">
        <DialogHeader>
          <DialogTitle className="font-display text-[24px] font-normal italic">Trazer para dentro</DialogTitle>
          <DialogDescription className="text-[12px]">
            {files?.length} {files?.length === 1 ? "arquivo" : "arquivos"} prontos. Links entre HTML, CSS e JS são resolvidos automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          {groups.map(([k, label]) =>
            count(k) ? (
              <span key={k} className="rounded-full border border-[var(--line-2)] px-2 py-0.5 text-[11px] text-[var(--paper-2)]">
                {count(k)} {label}
              </span>
            ) : null
          )}
        </div>
        <div className="max-h-40 overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--ink-0)] py-1">
          {files?.map((f) => {
            const { icon, color } = fileIcon(f);
            return (
              <div key={f.id} className="flex items-center gap-2 px-3 py-0.5">
                <span className="msr" style={{ fontSize: 15, color }}>
                  {icon}
                </span>
                <span className="truncate font-code text-[11.5px] text-[var(--paper-2)]">{f.name}</span>
              </div>
            );
          })}
        </div>

        <div className="grid gap-2">
          <div className="rounded-xl border border-[var(--gold-lo)] bg-[var(--gold)]/[.05] p-3">
            <div className="flex items-center gap-2 text-[13px] text-[var(--paper)]">
              <Icon name="create_new_folder" size={18} className="text-[var(--gold)]" /> Novo projeto
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onConfirm("new", name.trim() || suggested)}
                className="h-8 flex-1 rounded-md border border-[var(--line-2)] bg-[var(--ink-0)] px-2 text-[13px] outline-none focus:border-[var(--gold-lo)]"
              />
              <button
                autoFocus
                onClick={() => onConfirm("new", name.trim() || suggested)}
                className="h-8 rounded-md bg-[var(--gold)] px-3 text-[12.5px] font-semibold text-[#17130c] hover:bg-[var(--gold-hi)]"
              >
                Criar
              </button>
            </div>
          </div>
          <button
            onClick={() => onConfirm("merge", "")}
            className="flex items-center gap-2 rounded-xl border border-[var(--line-2)] p-3 text-left text-[13px] text-[var(--paper-2)] transition-colors hover:border-[var(--paper-3)] hover:text-[var(--paper)]"
          >
            <Icon name="merge" size={18} />
            <span className="flex-1">
              Mesclar em <b className="font-medium text-[var(--paper)]">{currentName}</b>
              <span className="block text-[11.5px] text-[var(--paper-3)]">Arquivos com o mesmo nome serão substituídos</span>
            </span>
          </button>
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
      <CommandList className="max-h-[420px]">
        <CommandEmpty>Nada encontrado.</CommandEmpty>
        <CommandGroup heading="Arquivos">
          {files.map((f) => {
            const { icon, color } = fileIcon(f);
            return (
              <CommandItem key={f.id} value={"arquivo " + f.name} onSelect={() => close(() => onOpenFile(f.id))} className="gap-2">
                <span className="msr" style={{ fontSize: 16, color }}>
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
                    <CommandItem key={c.id} value={c.group + " " + c.label} onSelect={() => close(c.run)} className="gap-2">
                      <Icon name={c.icon} size={17} className="text-[var(--paper-3)]" />
                      {c.label}
                      {c.shortcut && <CommandShortcut className={cn("font-code tracking-normal")}>{c.shortcut}</CommandShortcut>}
                    </CommandItem>
                  ))}
              </CommandGroup>
            </div>
          ))}
      </CommandList>
    </CommandDialog>
  );
}
