import { useState, type ReactNode } from "react";
import type { EditorAction, EditorHandle, MenuContext } from "@/editor/CodeEditor";
import type { Sym } from "@/editor/definition";
import { Icon } from "./Icon";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

export const symLabel = (s: Sym) =>
  s.kind === "class" ? "." + s.name : s.kind === "id" ? "#" + s.name : s.kind === "tag" ? `<${s.name}>` : s.kind === "keyframes" ? "@keyframes " + s.name : s.name;

export function selectorFor(s: Sym | null): string | null {
  if (!s) return null;
  if (s.kind === "class") return "." + s.name;
  if (s.kind === "id") return "#" + s.name;
  if (s.kind === "tag" && !s.name.startsWith("!")) return s.name;
  return null;
}

interface Props {
  editor: React.RefObject<EditorHandle | null>;
  canFormat: boolean;
  children: ReactNode;
  onFormat(): void;
  onRename(sym: Sym): void;
  onHighlight(selector: string): void;
  onSearch(text: string): void;
  onPalette(): void;
}

export function EditorContextMenu({ editor, canFormat, children, onFormat, onRename, onHighlight, onSearch, onPalette }: Props) {
  const [ctx, setCtx] = useState<MenuContext | null>(null);
  const run = (a: EditorAction) => () => {
    setTimeout(() => editor.current?.run(a), 0);
  };
  const s = ctx?.sym ?? null;
  const sel = selectorFor(s);
  const markup = ctx?.lang === "html" || ctx?.lang === "css";
  const renameable = s && (s.kind === "class" || s.kind === "id" || s.kind === "var" || s.kind === "keyframes");
  const searchText = ctx?.selection || (s ? s.name : "");

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="h-full" onContextMenu={(e) => setCtx(editor.current?.contextAt(e.clientX, e.clientY) ?? null)}>
          {children}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-[330px]">
        {s && (
          <>
            <ContextMenuLabel className="truncate font-code normal-case tracking-normal text-md-primary">{symLabel(s)}</ContextMenuLabel>
            <ContextMenuItem onSelect={() => setTimeout(() => editor.current?.showDefinition(), 0)}>
              <Icon name="menu_book" size={19} /> Definição: o que é e para que serve
              <ContextMenuShortcut>Alt+F1</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem disabled={!ctx?.hasTarget} onSelect={() => setTimeout(() => editor.current?.gotoDefinition(), 0)}>
              <Icon name="call_made" size={19} /> Ir para definição
              <ContextMenuShortcut>F12</ContextMenuShortcut>
            </ContextMenuItem>
            {renameable && (
              <ContextMenuItem onSelect={() => onRename(s)}>
                <Icon name="edit_note" size={19} /> Renomear em todo o projeto
                <ContextMenuShortcut>F2</ContextMenuShortcut>
              </ContextMenuItem>
            )}
            {sel && (
              <ContextMenuItem onSelect={() => onHighlight(sel)}>
                <Icon name="target" size={19} /> Mostrar no preview
              </ContextMenuItem>
            )}
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onSelect={run("cut")}>
          <Icon name="content_cut" size={19} /> Recortar
          <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={run("copy")}>
          <Icon name="content_copy" size={19} /> Copiar
          <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={run("paste")}>
          <Icon name="content_paste" size={19} /> Colar
          <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={run("selectAll")}>
          <Icon name="select_all" size={19} /> Selecionar tudo
          <ContextMenuShortcut>Ctrl+A</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={run("suggest")}>
          <Icon name="auto_awesome" size={19} /> Sugestões
          <ContextMenuShortcut>Ctrl+Espaço</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={run("comment")}>
          <Icon name="comment" size={19} /> Comentar / descomentar
          <ContextMenuShortcut>Ctrl+/</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled={!canFormat} onSelect={() => setTimeout(onFormat, 0)}>
          <Icon name="format_align_left" size={19} /> Formatar documento
          <ContextMenuShortcut>Shift+Alt+F</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Icon name="segment" size={19} /> Linha e seleção
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-64">
            <ContextMenuItem onSelect={run("duplicate")}>
              <Icon name="library_add" size={19} /> Duplicar linha
              <ContextMenuShortcut>Shift+Alt+↓</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={run("lineUp")}>
              <Icon name="arrow_upward" size={19} /> Mover linha para cima
              <ContextMenuShortcut>Alt+↑</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={run("lineDown")}>
              <Icon name="arrow_downward" size={19} /> Mover linha para baixo
              <ContextMenuShortcut>Alt+↓</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={run("selectNext")}>
              <Icon name="select" size={19} /> Selecionar próxima ocorrência
              <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={run("upper")}>
              <Icon name="uppercase" size={19} /> MAIÚSCULAS
            </ContextMenuItem>
            <ContextMenuItem onSelect={run("lower")}>
              <Icon name="lowercase" size={19} /> minúsculas
            </ContextMenuItem>
            <ContextMenuItem onSelect={run("title")}>
              <Icon name="match_case" size={19} /> Iniciais Maiúsculas
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={run("foldAll")}>
              <Icon name="unfold_less" size={19} /> Recolher tudo
            </ContextMenuItem>
            <ContextMenuItem onSelect={run("unfoldAll")}>
              <Icon name="unfold_more" size={19} /> Expandir tudo
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        {markup && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Icon name="bolt" size={19} /> Emmet
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-64">
              {ctx?.lang === "html" && (
                <>
                  <ContextMenuItem onSelect={run("emmetWrap")}>
                    <Icon name="wrap_text" size={19} /> Envolver com abreviação
                    <ContextMenuShortcut>Ctrl+Shift+A</ContextMenuShortcut>
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={run("emmetBalance")}>
                    <Icon name="select_all" size={19} /> Selecionar a tag inteira
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={run("emmetPair")}>
                    <Icon name="sync_alt" size={19} /> Ir para o par da tag
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={run("emmetRemove")}>
                    <Icon name="code_off" size={19} /> Remover tag (mantém conteúdo)
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={run("emmetSplit")}>
                    <Icon name="call_split" size={19} /> Dividir / juntar tag
                  </ContextMenuItem>
                </>
              )}
              <ContextMenuItem onSelect={run("emmetMath")}>
                <Icon name="calculate" size={19} /> Calcular expressão (ex.: 12*4)
              </ContextMenuItem>
              <ContextMenuItem onSelect={run("emmetInc")}>
                <Icon name="add" size={19} /> Incrementar número
              </ContextMenuItem>
              <ContextMenuItem onSelect={run("emmetDec")}>
                <Icon name="remove" size={19} /> Decrementar número
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        <ContextMenuSeparator />
        {searchText && (
          <ContextMenuItem onSelect={() => onSearch(searchText)}>
            <Icon name="manage_search" size={19} /> <span className="truncate">Buscar “{searchText.slice(0, 24)}” no projeto</span>
          </ContextMenuItem>
        )}
        <ContextMenuItem onSelect={() => setTimeout(onPalette, 0)}>
          <Icon name="terminal" size={19} /> Paleta de comandos
          <ContextMenuShortcut>Ctrl+K</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
