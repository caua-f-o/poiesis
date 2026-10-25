// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
export type FileKind = "html" | "css" | "js" | "json" | "text" | "asset";

export interface PFile {
  id: string;
  /** caminho relativo dentro do projeto, ex.: "css/style.css" */
  name: string;
  kind: FileKind;
  /** texto para arquivos de código; data URL para assets binários */
  content: string;
  mime?: string;
}

export interface Project {
  id: string;
  name: string;
  files: PFile[];
  /** id do HTML principal */
  entry: string;
  /** pastas explícitas (inclusive vazias); as demais vêm dos caminhos dos arquivos */
  folders?: string[];
  openTabs: string[];
  activeFile: string | null;
  createdAt: number;
  updatedAt: number;
}

export type Layout = "split" | "stack" | "editor" | "preview";
export type Device = "full" | "tablet" | "mobile";
export type Panel = "files" | "search" | "projects" | "history" | "extension" | "themes";

export interface Settings {
  autoRun: boolean;
  delay: number;
  layout: Layout;
  fontSize: number;
  wrap: boolean;
  tabSize: number;
  emmet: boolean;
  autoInject: boolean;
  clearOnRun: boolean;
  sidebar: boolean;
  panel: Panel;
  theme: string;
  hoverDocs: boolean;
  console: boolean;
  device: Device;
  landscape: boolean;
  history: HistorySettings;
  /** permite ligar projetos a pastas do computador (File System Access) */
  localFolders: boolean;
  /** padrões ignorados ao ler pastas, separados por vírgula */
  folderIgnore: string;
  /** companheiro: Pólen, Lúmen ou nenhum */
  companion: CompanionId;
  companionLevel: CompanionLevel;
  companionPlace: "rail" | "top";
  /** marcos locais (só cosméticos): quando aconteceram pela primeira vez */
  companionMarks: { firstExport?: number };
  /** música de foco: volume de 0 a 1 e pausa automática com a aba escondida */
  musicVolume: number;
  musicAutoPause: boolean;
}

export type CompanionId = "polen" | "lumen" | "nenhum";
export type CompanionLevel = "foco" | "discreto" | "vivo";

export interface HistorySettings {
  /** segundos sem editar até o snapshot automático; 0 desliga */
  interval: number;
  /** quantas versões automáticas manter por projeto */
  maxAuto: number;
  /** arquivos maiores que isso (bytes) ficam fora dos snapshots automáticos */
  maxFileSize: number;
}

export interface Workspace {
  version: 1;
  projects: Record<string, Project>;
  order: string[];
  currentId: string;
  settings: Settings;
}

/* ---------- console ---------- */

export type Ser =
  | { t: "str"; v: string }
  | { t: "num"; v: string }
  | { t: "bool"; v: boolean }
  | { t: "null" }
  | { t: "undef" }
  | { t: "sym"; v: string }
  | { t: "fn"; v: string; s?: string }
  | { t: "err"; n: string; v: string; s: string }
  | { t: "el"; v: string }
  | { t: "date"; v: string }
  | { t: "re"; v: string }
  | { t: "circ" }
  | { t: "more"; v: string }
  | { t: "arr"; c: string; n: number; e: Ser[] }
  | { t: "map"; c: string; n: number; e: [Ser, Ser][] }
  | { t: "obj"; c: string; e: [string, Ser][]; x?: boolean };

export type LogLevel = "log" | "info" | "warn" | "error" | "debug" | "result" | "input" | "system";

export interface SourceRef {
  file: string;
  line: number;
  col: number;
}

export interface LogEntry {
  id: number;
  level: LogLevel;
  args: Ser[];
  src?: SourceRef;
  count: number;
  time: number;
}
