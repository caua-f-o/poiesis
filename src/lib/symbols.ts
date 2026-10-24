/** Material Symbols: busca (com sinônimos em português), estilos e código para inserir. */

export type SymbolStyle = "outlined" | "rounded" | "sharp";

export const STYLE_LABEL: Record<SymbolStyle, string> = { outlined: "Outlined", rounded: "Rounded", sharp: "Sharp" };

/** Família CSS das fontes completas embutidas (só para pré-visualizar no seletor). */
export const PREVIEW_FAMILY: Record<SymbolStyle, string> = {
  outlined: "Poiesis MS Outlined",
  rounded: "Poiesis MS Rounded",
  sharp: "Poiesis MS Sharp",
};

let names: string[] | null = null;
let loading: Promise<string[]> | null = null;
export function loadSymbolNames(): Promise<string[]> {
  if (names) return Promise.resolve(names);
  if (!loading) loading = import("./symbol-names.json").then((m) => (names = (m.default ?? m) as unknown as string[]));
  return loading;
}
export const symbolNamesNow = () => names;

let fontsInjected = false;
/** Registra as fontes completas (carregadas sob demanda pelo navegador quando usadas). */
export function ensurePreviewFonts() {
  if (fontsInjected) return;
  fontsInjected = true;
  const css = (Object.keys(PREVIEW_FAMILY) as SymbolStyle[])
    .map(
      (s) => `@font-face{font-family:"${PREVIEW_FAMILY[s]}";font-style:normal;font-weight:400;font-display:block;src:url("fonts/material-symbols-${s}-full.woff2") format("woff2")}`
    )
    .join("\n");
  const el = document.createElement("style");
  el.dataset.poiesisSymbols = "";
  el.textContent = css;
  document.head.appendChild(el);
}

export const POPULAR = [
  "home", "search", "menu", "close", "settings", "favorite", "star", "add", "delete", "edit", "check", "arrow_forward",
  "arrow_back", "expand_more", "chevron_right", "person", "account_circle", "shopping_cart", "mail", "call", "notifications",
  "info", "warning", "error", "visibility", "lock", "logout", "login", "share", "download", "upload", "cloud", "calendar_month",
  "schedule", "location_on", "map", "photo_camera", "image", "play_arrow", "pause", "music_note", "dark_mode", "light_mode",
  "language", "thumb_up", "bookmark", "chat", "send", "attach_file", "filter_list", "sort", "more_vert", "open_in_new",
  "content_copy", "link", "rocket_launch", "auto_awesome", "bolt", "eco", "pets", "restaurant", "local_cafe", "flight", "sell",
];

/** português (sem acento) → termos em inglês dos nomes dos ícones */
const PT: Record<string, string[]> = {
  casa: ["home", "house"], inicio: ["home", "start"], lar: ["home", "house"], buscar: ["search", "find"], busca: ["search"], pesquisar: ["search"],
  procurar: ["search", "find"], lupa: ["search", "zoom"], fechar: ["close", "cancel"], sair: ["logout", "exit", "close"], entrar: ["login"],
  menu: ["menu"], configuracao: ["settings", "tune"], configuracoes: ["settings"], ajustes: ["settings", "tune"], engrenagem: ["settings"],
  coracao: ["favorite", "heart"], favorito: ["favorite", "star", "bookmark"], curtir: ["thumb_up", "favorite"], like: ["thumb_up"], estrela: ["star", "grade"],
  adicionar: ["add"], mais: ["add", "more"], novo: ["add", "new"], criar: ["add", "create"], apagar: ["delete", "remove"], excluir: ["delete"],
  lixo: ["delete"], lixeira: ["delete"], remover: ["remove", "delete"], editar: ["edit"], lapis: ["edit", "pencil"], caneta: ["edit", "stylus", "ink_pen"],
  confirmar: ["check", "done"], ok: ["check", "done"], certo: ["check"], seta: ["arrow"], voltar: ["arrow_back", "undo"], avancar: ["arrow_forward"],
  proximo: ["arrow_forward", "navigate_next", "skip_next"], anterior: ["arrow_back", "navigate_before", "skip_previous"], cima: ["up", "upward"],
  baixo: ["down", "downward", "expand_more"], esquerda: ["left"], direita: ["right"], expandir: ["expand", "unfold_more"], recolher: ["collapse", "expand_less"],
  pessoa: ["person"], pessoas: ["group", "people"], usuario: ["person", "account"], conta: ["account", "person"], perfil: ["account_circle", "person", "badge"],
  grupo: ["group", "groups"], carrinho: ["shopping_cart"], compras: ["shopping", "cart", "store"], loja: ["store", "storefront"], sacola: ["shopping_bag"],
  dinheiro: ["payments", "attach_money", "money"], pagamento: ["payment", "credit_card"], cartao: ["credit_card"], preco: ["sell", "price"], etiqueta: ["sell", "label"],
  email: ["mail", "email"], carta: ["mail"], mensagem: ["chat", "message", "sms"], conversa: ["chat", "forum"], telefone: ["call", "phone"], ligar: ["call"],
  celular: ["smartphone", "phone"], notificacao: ["notifications"], sino: ["notifications"], alerta: ["warning", "notification_important"], aviso: ["warning", "info"],
  erro: ["error"], informacao: ["info"], ajuda: ["help"], duvida: ["help", "question"], olho: ["visibility"], ver: ["visibility"], esconder: ["visibility_off"],
  senha: ["password", "lock", "key"], cadeado: ["lock"], seguranca: ["security", "shield", "lock"], escudo: ["shield"], chave: ["key"],
  compartilhar: ["share"], baixar: ["download"], download: ["download"], enviar: ["send", "upload"], subir: ["upload"], nuvem: ["cloud"],
  calendario: ["calendar", "event"], data: ["calendar", "event", "date"], agenda: ["calendar", "event"], relogio: ["schedule", "clock", "alarm"], hora: ["schedule"],
  tempo: ["schedule", "timer", "weather"], alarme: ["alarm"], cronometro: ["timer"], local: ["location", "place"], localizacao: ["location_on", "my_location"],
  mapa: ["map"], pin: ["location_on", "push_pin"], camera: ["photo_camera", "camera"], foto: ["photo", "image"], imagem: ["image", "photo"], galeria: ["photo_library"],
  video: ["videocam", "movie", "video"], filme: ["movie"], tocar: ["play_arrow"], play: ["play_arrow"], pausar: ["pause"], parar: ["stop"], musica: ["music_note", "library_music"],
  som: ["volume_up"], volume: ["volume"], mudo: ["volume_off"], microfone: ["mic"], fone: ["headphones"], escuro: ["dark_mode"], claro: ["light_mode"],
  lua: ["dark_mode", "bedtime"], sol: ["light_mode", "sunny"], idioma: ["language", "translate"], traduzir: ["translate"], mundo: ["public", "language"], globo: ["public"],
  marcador: ["bookmark"], salvar: ["save", "bookmark"], disquete: ["save"], anexo: ["attach_file"], clipe: ["attach_file"], filtro: ["filter"], ordenar: ["sort"],
  copiar: ["content_copy"], colar: ["content_paste"], recortar: ["content_cut"], link: ["link"], corrente: ["link"], foguete: ["rocket"], magica: ["auto_awesome", "magic"],
  brilho: ["auto_awesome", "brightness"], raio: ["bolt", "flash"], energia: ["bolt", "power"], folha: ["eco"], natureza: ["eco", "park", "forest"], arvore: ["park", "forest", "nature"],
  animal: ["pets"], cachorro: ["pets"], gato: ["pets"], comida: ["restaurant", "fastfood", "lunch_dining"], restaurante: ["restaurant"], cafe: ["local_cafe", "coffee"],
  aviao: ["flight", "airplane"], viagem: ["flight", "travel", "luggage"], carro: ["directions_car"], onibus: ["directions_bus"], bicicleta: ["pedal_bike", "directions_bike"],
  livro: ["book", "menu_book"], escola: ["school"], estudo: ["school", "menu_book"], trabalho: ["work"], maleta: ["work"], grafico: ["bar_chart", "show_chart", "monitoring"],
  estatistica: ["analytics", "insights"], codigo: ["code", "terminal"], programar: ["code", "terminal", "developer_mode"], terminal: ["terminal"], computador: ["computer", "desktop"],
  pasta: ["folder"], arquivo: ["description", "draft", "file"], documento: ["description", "article"], nota: ["note", "sticky_note"], lista: ["list", "checklist"],
  tarefa: ["task", "checklist"], presente: ["redeem", "featured_seasonal_and_gifts"], festa: ["celebration", "party"], jogo: ["sports_esports", "videogame"], controle: ["sports_esports", "gamepad"],
  esporte: ["sports"], futebol: ["sports_soccer"], saude: ["health", "medical", "favorite"], hospital: ["local_hospital"], remedio: ["medication"], fogo: ["local_fire_department", "whatshot"],
  agua: ["water"], chuva: ["rainy", "umbrella"], neve: ["ac_unit"], frio: ["ac_unit"], quente: ["whatshot"], wifi: ["wifi"], bateria: ["battery"], bluetooth: ["bluetooth"],
  impressora: ["print"], imprimir: ["print"], atualizar: ["refresh", "sync"], recarregar: ["refresh"], sincronizar: ["sync"], desfazer: ["undo"], refazer: ["redo"],
  tela: ["fullscreen", "monitor"], cheia: ["fullscreen"], zoom: ["zoom_in"], tamanho: ["aspect_ratio", "format_size"], texto: ["text", "title", "notes"], fonte: ["font", "text"],
  negrito: ["format_bold"], italico: ["format_italic"], sublinhado: ["format_underlined"], alinhar: ["format_align"], cor: ["palette", "colorize", "format_color"],
  paleta: ["palette"], pincel: ["brush"], desenho: ["draw", "brush"], desenhar: ["draw", "gesture"], forma: ["shapes", "category"], quadrado: ["square", "crop_square"], circulo: ["circle"],
  porta: ["door"], cama: ["bed"], predio: ["apartment", "business"], empresa: ["business", "corporate_fare"], mao: ["back_hand", "pan_tool"], polegar: ["thumb_up"],
  sorriso: ["mood", "sentiment_satisfied"], feliz: ["mood", "sentiment_satisfied"], triste: ["sentiment_dissatisfied", "mood_bad"], emoji: ["mood", "emoji"],
  premio: ["emoji_events", "military_tech"], trofeu: ["emoji_events"], medalha: ["military_tech"], bandeira: ["flag"], verificado: ["verified"], selo: ["verified"],
  robo: ["smart_toy"], ia: ["smart_toy", "auto_awesome", "psychology"], cerebro: ["psychology"], ideia: ["lightbulb"], lampada: ["lightbulb"], luz: ["light", "lightbulb"],
  planeta: ["public", "language"], lugar: ["place"], pesquisa: ["search", "manage_search"], historico: ["history"], relatorio: ["summarize", "assessment"],
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function expand(term: string): string[] {
  const t = norm(term);
  const out = new Set<string>([t.replace(/\s+/g, "_")]);
  for (const [pt, en] of Object.entries(PT)) {
    if (pt === t || (t.length >= 3 && pt.startsWith(t))) en.forEach((e) => out.add(e));
  }
  return [...out];
}

/** Retorna nomes ordenados por relevância. */
export function searchSymbols(all: string[], query: string, limit = 600): string[] {
  const q = norm(query);
  if (!q) return POPULAR.filter((n) => all.includes(n));
  const terms = q.split(/\s+/).filter(Boolean);
  const groups = terms.map(expand);
  const scored: [string, number][] = [];
  for (const name of all) {
    const parts = name.split("_");
    let total = 0;
    let ok = true;
    for (const g of groups) {
      let best = 0;
      for (const t of g) {
        if (name === t) best = Math.max(best, 100);
        else if (name.startsWith(t)) best = Math.max(best, 70 - Math.min(20, name.length - t.length));
        else if (parts.includes(t)) best = Math.max(best, 55);
        else if (parts.some((p) => p.startsWith(t))) best = Math.max(best, 40);
        else if (t.length >= 3 && name.includes(t)) best = Math.max(best, 20);
      }
      if (!best) {
        ok = false;
        break;
      }
      total += best;
    }
    if (ok) scored.push([name, total - name.length * 0.1]);
  }
  scored.sort((a, b) => b[1] - a[1]);
  return scored.slice(0, limit).map(([n]) => n);
}

/* ---------------- código inserido ---------------- */

export interface SymbolOptions {
  style: SymbolStyle;
  fill: boolean;
  weight: number;
  size: number | null;
}

export const cdnHref = (style: SymbolStyle) =>
  `https://fonts.googleapis.com/css2?family=Material+Symbols+${STYLE_LABEL[style]}:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200`;

export function linkTag(style: SymbolStyle) {
  return `<link rel="stylesheet" href="${cdnHref(style)}">`;
}

export function hasSymbolsLink(html: string, style: SymbolStyle) {
  return new RegExp(`family=Material\\+Symbols\\+${STYLE_LABEL[style]}`, "i").test(html);
}

export function spanFor(name: string, o: SymbolOptions) {
  const styles: string[] = [];
  if (o.fill || o.weight !== 400) styles.push(`font-variation-settings: 'FILL' ${o.fill ? 1 : 0}, 'wght' ${o.weight}`);
  if (o.size) styles.push(`font-size: ${o.size}px`);
  const style = styles.length ? ` style="${styles.join("; ")}"` : "";
  return `<span class="material-symbols-${o.style}"${style}>${name}</span>`;
}

/** Insere o <link> da fonte antes de </head> (ou no começo) se ainda não existir. */
export function withSymbolsLink(html: string, style: SymbolStyle): string | null {
  if (hasSymbolsLink(html, style)) return null;
  const tag = linkTag(style);
  if (/<\/head\s*>/i.test(html)) {
    return html.replace(/([ \t]*)<\/head\s*>/i, (m, indent: string) => `${indent}  ${tag}\n${m}`);
  }
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, (h) => `${h}\n  ${tag}`);
  return `${tag}\n${html}`;
}
