/** Temas: papéis de cor do Material 3 (interface) + paleta de sintaxe (editor). */

export interface SyntaxPalette {
  bg: string;
  fg: string;
  gutter: string;
  activeLine: string;
  selection: string;
  selectionBlur: string;
  cursor: string;
  keyword: string;
  control: string;
  tag: string;
  tagDoc: string;
  tagMeta: string;
  tagSection: string;
  tagCustom: string;
  attr: string;
  string: string;
  prop: string;
  value: string;
  number: string;
  fn: string;
  def: string;
  type: string;
  comment: string;
  op: string;
  punct: string;
  regexp: string;
  escape: string;
  meta: string;
  invalid: string;
  variable: string;
}

export interface Theme {
  id: string;
  name: string;
  note: string;
  dark: boolean;
  ui: {
    surface: string;
    onSurface: string;
    onSurfaceVariant: string;
    primary: string;
    onPrimary: string;
    outline: string;
    outlineVariant: string;
    error: string;
    warn: string;
    success: string;
    info: string;
  };
  syn: SyntaxPalette;
}

export const THEMES: Theme[] = [
  {
    id: "tinta",
    name: "Tinta & Ouro",
    note: "Nanquim e folha de ouro — o tema da casa",
    dark: true,
    ui: {
      surface: "#0a0a0c",
      onSurface: "#e8e4da",
      onSurfaceVariant: "#a8a399",
      primary: "#d9b26f",
      onPrimary: "#1d160a",
      outline: "#6c6962",
      outlineVariant: "#26262c",
      error: "#ec8a80",
      warn: "#e6b450",
      success: "#74c7b4",
      info: "#8cc7ec",
    },
    syn: {
      bg: "#121215",
      fg: "#e6e1d6",
      gutter: "#5f5c56",
      activeLine: "rgba(255,255,255,0.035)",
      selection: "rgba(217,178,111,0.32)",
      selectionBlur: "rgba(217,178,111,0.17)",
      cursor: "#f0cf8c",
      keyword: "#e3a868",
      control: "#e98fb0",
      tag: "#ef8b7a",
      tagDoc: "#f5d58f",
      tagMeta: "#9fb4ec",
      tagSection: "#e6a0c4",
      tagCustom: "#7fd8b8",
      attr: "#e9cb8e",
      string: "#a9d18e",
      prop: "#8cc7ec",
      value: "#c9a3ee",
      number: "#d6a7f2",
      fn: "#74cfd9",
      def: "#f2d394",
      type: "#7fd8b8",
      comment: "#6a675f",
      op: "#a19c92",
      punct: "#8a867d",
      regexp: "#ef8b7a",
      escape: "#8cc7ec",
      meta: "#8a867d",
      invalid: "#ff6b6b",
      variable: "#e6e1d6",
    },
  },
  {
    id: "dracula",
    name: "Drácula",
    note: "O clássico, com a paleta oficial",
    dark: true,
    ui: {
      surface: "#191a21",
      onSurface: "#f8f8f2",
      onSurfaceVariant: "#b4b8cc",
      primary: "#bd93f9",
      onPrimary: "#21222c",
      outline: "#6272a4",
      outlineVariant: "#343746",
      error: "#ff5555",
      warn: "#ffb86c",
      success: "#50fa7b",
      info: "#8be9fd",
    },
    syn: {
      bg: "#282a36",
      fg: "#f8f8f2",
      gutter: "#6272a4",
      activeLine: "rgba(68,71,90,0.45)",
      selection: "rgba(98,114,164,0.55)",
      selectionBlur: "rgba(68,71,90,0.7)",
      cursor: "#f8f8f2",
      keyword: "#ff79c6",
      control: "#ff79c6",
      tag: "#ff79c6",
      tagDoc: "#bd93f9",
      tagMeta: "#8be9fd",
      tagSection: "#ffb86c",
      tagCustom: "#50fa7b",
      attr: "#50fa7b",
      string: "#f1fa8c",
      prop: "#8be9fd",
      value: "#ffb86c",
      number: "#bd93f9",
      fn: "#50fa7b",
      def: "#50fa7b",
      type: "#8be9fd",
      comment: "#6272a4",
      op: "#ff79c6",
      punct: "#f8f8f2",
      regexp: "#ff5555",
      escape: "#ff79c6",
      meta: "#6272a4",
      invalid: "#ff5555",
      variable: "#f8f8f2",
    },
  },
  {
    id: "onedark",
    name: "One Dark",
    note: "O sóbrio do Atom",
    dark: true,
    ui: {
      surface: "#1b1e24",
      onSurface: "#d7dae0",
      onSurfaceVariant: "#9da5b4",
      primary: "#61afef",
      onPrimary: "#14171c",
      outline: "#5c6370",
      outlineVariant: "#2c313a",
      error: "#e06c75",
      warn: "#e5c07b",
      success: "#98c379",
      info: "#56b6c2",
    },
    syn: {
      bg: "#282c34",
      fg: "#abb2bf",
      gutter: "#4b5263",
      activeLine: "rgba(44,49,60,0.8)",
      selection: "rgba(62,68,81,0.95)",
      selectionBlur: "rgba(62,68,81,0.6)",
      cursor: "#528bff",
      keyword: "#c678dd",
      control: "#c678dd",
      tag: "#e06c75",
      tagDoc: "#e5c07b",
      tagMeta: "#56b6c2",
      tagSection: "#c678dd",
      tagCustom: "#d19a66",
      attr: "#d19a66",
      string: "#98c379",
      prop: "#61afef",
      value: "#d19a66",
      number: "#d19a66",
      fn: "#61afef",
      def: "#61afef",
      type: "#e5c07b",
      comment: "#5c6370",
      op: "#56b6c2",
      punct: "#abb2bf",
      regexp: "#56b6c2",
      escape: "#56b6c2",
      meta: "#5c6370",
      invalid: "#ff6b6b",
      variable: "#e06c75",
    },
  },
  {
    id: "monokai",
    name: "Monokai",
    note: "Neon sobre oliva escura",
    dark: true,
    ui: {
      surface: "#1a1b17",
      onSurface: "#f8f8f2",
      onSurfaceVariant: "#b5b3a6",
      primary: "#a6e22e",
      onPrimary: "#1a1b17",
      outline: "#75715e",
      outlineVariant: "#33342d",
      error: "#f92672",
      warn: "#fd971f",
      success: "#a6e22e",
      info: "#66d9ef",
    },
    syn: {
      bg: "#272822",
      fg: "#f8f8f2",
      gutter: "#75715e",
      activeLine: "rgba(62,61,50,0.6)",
      selection: "rgba(73,72,62,0.95)",
      selectionBlur: "rgba(73,72,62,0.6)",
      cursor: "#f8f8f0",
      keyword: "#f92672",
      control: "#f92672",
      tag: "#f92672",
      tagDoc: "#fd971f",
      tagMeta: "#66d9ef",
      tagSection: "#ae81ff",
      tagCustom: "#a6e22e",
      attr: "#a6e22e",
      string: "#e6db74",
      prop: "#66d9ef",
      value: "#66d9ef",
      number: "#ae81ff",
      fn: "#a6e22e",
      def: "#a6e22e",
      type: "#66d9ef",
      comment: "#75715e",
      op: "#f92672",
      punct: "#f8f8f2",
      regexp: "#e6db74",
      escape: "#ae81ff",
      meta: "#75715e",
      invalid: "#f92672",
      variable: "#f8f8f2",
    },
  },
  {
    id: "nord",
    name: "Nord",
    note: "Gelo ártico, tons frios",
    dark: true,
    ui: {
      surface: "#242933",
      onSurface: "#eceff4",
      onSurfaceVariant: "#b8c1d3",
      primary: "#88c0d0",
      onPrimary: "#242933",
      outline: "#616e88",
      outlineVariant: "#3b4252",
      error: "#bf616a",
      warn: "#ebcb8b",
      success: "#a3be8c",
      info: "#81a1c1",
    },
    syn: {
      bg: "#2e3440",
      fg: "#d8dee9",
      gutter: "#4c566a",
      activeLine: "rgba(59,66,82,0.6)",
      selection: "rgba(76,86,106,0.75)",
      selectionBlur: "rgba(67,76,94,0.6)",
      cursor: "#d8dee9",
      keyword: "#81a1c1",
      control: "#81a1c1",
      tag: "#81a1c1",
      tagDoc: "#ebcb8b",
      tagMeta: "#b48ead",
      tagSection: "#d08770",
      tagCustom: "#a3be8c",
      attr: "#8fbcbb",
      string: "#a3be8c",
      prop: "#88c0d0",
      value: "#81a1c1",
      number: "#b48ead",
      fn: "#88c0d0",
      def: "#88c0d0",
      type: "#8fbcbb",
      comment: "#616e88",
      op: "#81a1c1",
      punct: "#eceff4",
      regexp: "#ebcb8b",
      escape: "#ebcb8b",
      meta: "#5e81ac",
      invalid: "#bf616a",
      variable: "#d8dee9",
    },
  },
  {
    id: "tokyo",
    name: "Tokyo Night",
    note: "Néon de Shinjuku às duas da manhã",
    dark: true,
    ui: {
      surface: "#13141c",
      onSurface: "#c0caf5",
      onSurfaceVariant: "#9aa5ce",
      primary: "#7aa2f7",
      onPrimary: "#13141c",
      outline: "#565f89",
      outlineVariant: "#24283b",
      error: "#f7768e",
      warn: "#e0af68",
      success: "#9ece6a",
      info: "#7dcfff",
    },
    syn: {
      bg: "#1a1b26",
      fg: "#c0caf5",
      gutter: "#3b4261",
      activeLine: "rgba(41,46,66,0.6)",
      selection: "rgba(51,70,124,0.75)",
      selectionBlur: "rgba(51,70,124,0.45)",
      cursor: "#c0caf5",
      keyword: "#bb9af7",
      control: "#bb9af7",
      tag: "#f7768e",
      tagDoc: "#e0af68",
      tagMeta: "#2ac3de",
      tagSection: "#ff9e64",
      tagCustom: "#73daca",
      attr: "#bb9af7",
      string: "#9ece6a",
      prop: "#7dcfff",
      value: "#ff9e64",
      number: "#ff9e64",
      fn: "#7aa2f7",
      def: "#7aa2f7",
      type: "#2ac3de",
      comment: "#565f89",
      op: "#89ddff",
      punct: "#9abdf5",
      regexp: "#b4f9f8",
      escape: "#89ddff",
      meta: "#565f89",
      invalid: "#ff5370",
      variable: "#c0caf5",
    },
  },
  {
    id: "catppuccin",
    name: "Catppuccin Mocha",
    note: "Pastéis aconchegantes",
    dark: true,
    ui: {
      surface: "#11111b",
      onSurface: "#cdd6f4",
      onSurfaceVariant: "#a6adc8",
      primary: "#cba6f7",
      onPrimary: "#1e1e2e",
      outline: "#6c7086",
      outlineVariant: "#313244",
      error: "#f38ba8",
      warn: "#f9e2af",
      success: "#a6e3a1",
      info: "#89dceb",
    },
    syn: {
      bg: "#1e1e2e",
      fg: "#cdd6f4",
      gutter: "#585b70",
      activeLine: "rgba(49,50,68,0.55)",
      selection: "rgba(88,91,112,0.6)",
      selectionBlur: "rgba(69,71,90,0.55)",
      cursor: "#f5e0dc",
      keyword: "#cba6f7",
      control: "#cba6f7",
      tag: "#89b4fa",
      tagDoc: "#f38ba8",
      tagMeta: "#94e2d5",
      tagSection: "#fab387",
      tagCustom: "#f5c2e7",
      attr: "#f9e2af",
      string: "#a6e3a1",
      prop: "#89b4fa",
      value: "#fab387",
      number: "#fab387",
      fn: "#89b4fa",
      def: "#89b4fa",
      type: "#f9e2af",
      comment: "#6c7086",
      op: "#89dceb",
      punct: "#9399b2",
      regexp: "#f5c2e7",
      escape: "#f5c2e7",
      meta: "#7f849c",
      invalid: "#f38ba8",
      variable: "#cdd6f4",
    },
  },
  {
    id: "solarized",
    name: "Solarizado Claro",
    note: "O claro clássico de Ethan Schoonover",
    dark: false,
    ui: {
      surface: "#f5eedb",
      onSurface: "#073642",
      onSurfaceVariant: "#586e75",
      primary: "#268bd2",
      onPrimary: "#ffffff",
      outline: "#93a1a1",
      outlineVariant: "#e4dcc6",
      error: "#dc322f",
      warn: "#b58900",
      success: "#859900",
      info: "#2aa198",
    },
    syn: {
      bg: "#fdf6e3",
      fg: "#586e75",
      gutter: "#a8b4b3",
      activeLine: "rgba(238,232,213,0.7)",
      selection: "rgba(38,139,210,0.22)",
      selectionBlur: "rgba(147,161,161,0.25)",
      cursor: "#073642",
      keyword: "#859900",
      control: "#859900",
      tag: "#268bd2",
      tagDoc: "#cb4b16",
      tagMeta: "#6c71c4",
      tagSection: "#d33682",
      tagCustom: "#2aa198",
      attr: "#b58900",
      string: "#2aa198",
      prop: "#268bd2",
      value: "#cb4b16",
      number: "#d33682",
      fn: "#268bd2",
      def: "#b58900",
      type: "#b58900",
      comment: "#93a1a1",
      op: "#657b83",
      punct: "#657b83",
      regexp: "#dc322f",
      escape: "#cb4b16",
      meta: "#93a1a1",
      invalid: "#dc322f",
      variable: "#586e75",
    },
  },
  {
    id: "papel",
    name: "Papel & Ouro",
    note: "A versão clara da casa: tinta sobre papel",
    dark: false,
    ui: {
      surface: "#efe9dc",
      onSurface: "#24201a",
      onSurfaceVariant: "#625b4f",
      primary: "#8a5a14",
      onPrimary: "#fff8ec",
      outline: "#9b927f",
      outlineVariant: "#ddd4c2",
      error: "#b3261e",
      warn: "#9a6700",
      success: "#2f7a5c",
      info: "#2a6f9a",
    },
    syn: {
      bg: "#fbf8f1",
      fg: "#2b2721",
      gutter: "#b3aa98",
      activeLine: "rgba(138,90,20,0.05)",
      selection: "rgba(138,90,20,0.22)",
      selectionBlur: "rgba(138,90,20,0.12)",
      cursor: "#8a5a14",
      keyword: "#a8561c",
      control: "#b0447a",
      tag: "#b23a2c",
      tagDoc: "#8a5a14",
      tagMeta: "#4f57b0",
      tagSection: "#b0447a",
      tagCustom: "#1f7a5c",
      attr: "#8a6a1c",
      string: "#4c7a2c",
      prop: "#2a6f9a",
      value: "#7a4fb0",
      number: "#8a3fa8",
      fn: "#12808c",
      def: "#8a5a14",
      type: "#1f7a5c",
      comment: "#9a9282",
      op: "#6b6458",
      punct: "#7a7262",
      regexp: "#b23a2c",
      escape: "#2a6f9a",
      meta: "#9a9282",
      invalid: "#c62828",
      variable: "#2b2721",
    },
  },
];

export const themeById = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES[0];

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());

export function applyTheme(t: Theme) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(t.ui)) root.style.setProperty(`--md-${kebab(k)}`, v);
  for (const [k, v] of Object.entries(t.syn)) root.style.setProperty(`--syn-${kebab(k)}`, v);
  root.dataset.theme = t.id;
  root.classList.toggle("dark", t.dark);
  root.classList.toggle("light", !t.dark);
  root.style.colorScheme = t.dark ? "dark" : "light";
  try {
    localStorage.setItem("poiesis:theme", t.id);
  } catch {
    /* ignora */
  }
}

/** Aplica o último tema antes do React montar (evita o "flash" de cor errada). */
export function applyStoredTheme() {
  let id = "tinta";
  try {
    id = localStorage.getItem("poiesis:theme") || "tinta";
  } catch {
    /* ignora */
  }
  applyTheme(themeById(id));
}
