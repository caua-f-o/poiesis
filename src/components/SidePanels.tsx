import type { Project } from "@/lib/types";
import { TEMPLATES } from "@/lib/templates";
import { THEMES, type Theme } from "@/lib/themes";
import { Icon } from "./Icon";
import { PanelHeader } from "./md";
import { cn } from "@/lib/utils";

const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  return `há ${Math.round(s / 86400)} d`;
};

export function ProjectsPanel({
  projects,
  currentId,
  onSwitch,
  onNew,
}: {
  projects: Project[];
  currentId: string;
  onSwitch(id: string): void;
  onNew(template: string): void;
}) {
  return (
    <div className="flex h-full flex-col">
      <PanelHeader title="Projetos" />
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {projects.map((p) => {
          const on = p.id === currentId;
          const kinds = new Set(p.files.map((f) => f.kind));
          return (
            <button key={p.id} data-on={on} onClick={() => onSwitch(p.id)} className="md-item mb-0.5 h-auto items-start rounded-2xl px-3 py-2.5">
              <Icon name={on ? "folder_open" : "folder"} size={20} fill={on} className={on ? "text-md-primary" : ""} />
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-[13px]", on ? "font-semibold" : "font-medium text-md-on-surface")}>{p.name}</span>
                <span className="block text-[11.5px] text-md-on-variant">
                  {p.files.length} arquivos · {ago(p.updatedAt)}
                </span>
                <span className="mt-1 flex gap-1">
                  {(["html", "css", "js", "asset"] as const)
                    .filter((k) => kinds.has(k))
                    .map((k) => (
                      <span key={k} className="rounded-md bg-md-high px-1.5 text-[10px] font-semibold uppercase text-md-on-variant">
                        {k === "asset" ? "mídia" : k}
                      </span>
                    ))}
                </span>
              </span>
            </button>
          );
        })}

        <div className="eyebrow px-3 pb-2 pt-5">Começar algo novo</div>
        <div className="grid gap-2 px-1">
          {TEMPLATES.map((t) => (
            <button key={t.id} onClick={() => onNew(t.id)} className="md-item md-card-outlined h-auto items-start rounded-xl px-3 py-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-md-primary-c text-md-on-primary-c">
                <Icon name={t.icon} size={20} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-md-on-surface">{t.title}</span>
                <span className="block text-[11.5px] leading-snug text-md-on-variant">{t.description}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ThemeSwatch({ t }: { t: Theme }) {
  const s = t.syn;
  return (
    <div className="overflow-hidden rounded-lg font-code text-[10.5px] leading-[1.6]" style={{ background: s.bg, color: s.fg }}>
      <div className="flex gap-1 px-2.5 pt-2" style={{ background: t.ui.surface }}>
        <span className="h-1.5 w-6 rounded-full" style={{ background: t.ui.primary }} />
        <span className="h-1.5 w-3 rounded-full" style={{ background: t.ui.outlineVariant }} />
      </div>
      <div className="px-2.5 py-2">
        <div>
          <span style={{ color: s.punct }}>&lt;</span>
          <span style={{ color: s.tagDoc, fontWeight: 700 }}>body</span>
          <span style={{ color: s.punct }}>&gt;</span>
        </div>
        <div className="pl-3">
          <span style={{ color: s.punct }}>&lt;</span>
          <span style={{ color: s.tag }}>h1</span> <span style={{ color: s.attr }}>class</span>
          <span style={{ color: s.punct }}>=</span>
          <span style={{ color: s.string }}>"poema"</span>
          <span style={{ color: s.punct }}>&gt;</span>
        </div>
        <div>
          <span style={{ color: s.keyword }}>const</span> <span style={{ color: s.def }}>n</span> <span style={{ color: s.op }}>=</span>{" "}
          <span style={{ color: s.number }}>42</span>
          <span style={{ color: s.punct }}>;</span> <span style={{ color: s.comment, fontStyle: "italic" }}>// ✓</span>
        </div>
      </div>
    </div>
  );
}

export function ThemesPanel({ current, onPick }: { current: string; onPick(id: string): void }) {
  return (
    <div className="flex h-full flex-col">
      <PanelHeader title="Temas" />
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <div className="grid gap-2.5">
          {THEMES.map((t) => {
            const on = t.id === current;
            return (
              <button
                key={t.id}
                onClick={() => onPick(t.id)}
                className={cn(
                  "md-item h-auto flex-col items-stretch gap-2 rounded-2xl p-2 text-left",
                  on ? "bg-md-secondary-c outline outline-2 outline-md-primary" : "md-card-outlined"
                )}
              >
                <ThemeSwatch t={t} />
                <span className="flex items-center gap-2 px-1 pb-0.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-md-on-surface">{t.name}</span>
                    <span className="block truncate text-[11px] text-md-on-variant">{t.note}</span>
                  </span>
                  {on ? <Icon name="check_circle" fill size={20} className="text-md-primary" /> : <Icon name={t.dark ? "dark_mode" : "light_mode"} size={18} className="text-md-outline" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
