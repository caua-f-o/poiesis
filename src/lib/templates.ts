import type { PFile } from "./types";
import { makeFile } from "./files";

export interface Template {
  id: string;
  title: string;
  projectName: string;
  description: string;
  icon: string;
  files: () => PFile[];
}

const head = (title: string, extra = "") => `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="style.css">${extra}
</head>`;

export const TEMPLATES: Template[] = [
  {
    id: "gênese",
    title: "Gênese",
    projectName: "Gênese",
    description: "Exemplo vivo com HTML, CSS e JS ligados",
    icon: "auto_awesome",
    files: () => [
      makeFile(
        "index.html",
        `${head("Gênese")}
<body>
  <main class="cena">
    <p class="sobre">ποίησις · trazer à existência</p>
    <h1>Do nada, <em>algo</em>.</h1>
    <p class="texto">
      Edite este arquivo, o <code>style.css</code> ou o <code>script.js</code>.
      A página ao lado renasce a cada tecla.
    </p>
    <button id="semear">Semear uma estrela</button>
    <p class="contador"><span id="total">0</span> estrelas semeadas</p>
  </main>

  <script src="script.js"></script>
</body>
</html>
`
      ),
      makeFile(
        "style.css",
        `:root {
  --tinta: #0f0e0c;
  --papel: #efe9dc;
  --ouro: #d9b26f;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  overflow: hidden;
  font-family: Georgia, "Times New Roman", serif;
  color: var(--papel);
  background: radial-gradient(ellipse at 50% 120%, #2a2116 0%, var(--tinta) 60%);
}

.cena {
  position: relative;
  z-index: 1;
  max-width: 34rem;
  padding: 2rem;
}

.sobre {
  letter-spacing: .2em;
  text-transform: uppercase;
  font-size: .75rem;
  color: var(--ouro);
}

h1 {
  font-size: clamp(2.5rem, 7vw, 4.5rem);
  font-weight: 400;
  line-height: 1;
  margin: .2em 0 .4em;
}

h1 em { color: var(--ouro); }

.texto { line-height: 1.6; opacity: .8; }

code {
  font-family: ui-monospace, monospace;
  font-size: .85em;
  color: var(--ouro);
}

button {
  margin-top: 1rem;
  padding: .8rem 1.4rem;
  font: inherit;
  color: var(--tinta);
  background: var(--ouro);
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  transition: transform .2s;
}

button:hover { transform: translateY(-2px); }

.contador { font-size: .85rem; opacity: .6; }

.estrela {
  position: fixed;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ouro);
  box-shadow: 0 0 12px 2px var(--ouro);
  animation: nascer 1.6s ease-out forwards;
}

@keyframes nascer {
  from { transform: scale(0); opacity: 0; }
  40%  { transform: scale(2.2); opacity: 1; }
  to   { transform: scale(1); opacity: .7; }
}
`
      ),
      makeFile(
        "script.js",
        `const botao = document.querySelector("#semear");
const total = document.querySelector("#total");
let estrelas = 0;

function semear() {
  const estrela = document.createElement("span");
  estrela.className = "estrela";
  estrela.style.left = Math.random() * 100 + "vw";
  estrela.style.top = Math.random() * 100 + "vh";
  document.body.append(estrela);

  estrelas++;
  total.textContent = estrelas;
  console.log("estrela", estrelas, { x: estrela.style.left, y: estrela.style.top });
}

botao.addEventListener("click", semear);

console.info("Gênese pronta. Abra o console aqui embaixo e digite: semear()");
`
      ),
    ],
  },
  {
    id: "vazio",
    title: "Em branco",
    projectName: "Sem título",
    description: "HTML, CSS e JS vazios, já conectados",
    icon: "draft",
    files: () => [
      makeFile(
        "index.html",
        `${head("Sem título")}
<body>


  <script src="script.js"></script>
</body>
</html>
`
      ),
      makeFile("style.css", `* { box-sizing: border-box; }\n\nbody {\n  margin: 0;\n  font-family: system-ui, sans-serif;\n}\n`),
      makeFile("script.js", ``),
    ],
  },
  {
    id: "canvas",
    title: "Canvas generativo",
    projectName: "Campo de fluxo",
    description: "Animação em <canvas> com partículas",
    icon: "gesture",
    files: () => [
      makeFile(
        "index.html",
        `${head("Campo de fluxo")}
<body>
  <canvas id="tela"></canvas>
  <script src="script.js"></script>
</body>
</html>
`
      ),
      makeFile("style.css", `html, body {\n  margin: 0;\n  height: 100%;\n  background: #0d0c0a;\n}\n\ncanvas {\n  display: block;\n  width: 100%;\n  height: 100%;\n}\n`),
      makeFile(
        "script.js",
        `const tela = document.getElementById("tela");
const ctx = tela.getContext("2d");
const N = 900;
let w, h, particulas;

function redimensionar() {
  w = tela.width = innerWidth * devicePixelRatio;
  h = tela.height = innerHeight * devicePixelRatio;
  particulas = Array.from({ length: N }, () => ({ x: Math.random() * w, y: Math.random() * h }));
  ctx.fillStyle = "#0d0c0a";
  ctx.fillRect(0, 0, w, h);
}

function angulo(x, y, t) {
  return Math.sin(x * 0.002 + t) * Math.cos(y * 0.003 - t) * Math.PI * 2;
}

function quadro(ms) {
  const t = ms * 0.0002;
  ctx.fillStyle = "rgba(13, 12, 10, 0.06)";
  ctx.fillRect(0, 0, w, h);
  for (const p of particulas) {
    const a = angulo(p.x, p.y, t);
    const nx = p.x + Math.cos(a) * 1.6;
    const ny = p.y + Math.sin(a) * 1.6;
    ctx.strokeStyle = \`hsla(\${38 + (p.y / h) * 30}, 70%, 65%, 0.35)\`;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(nx, ny);
    ctx.stroke();
    p.x = nx; p.y = ny;
    if (p.x < 0 || p.x > w || p.y < 0 || p.y > h) {
      p.x = Math.random() * w;
      p.y = Math.random() * h;
    }
  }
  requestAnimationFrame(quadro);
}

addEventListener("resize", redimensionar);
redimensionar();
requestAnimationFrame(quadro);
`
      ),
    ],
  },
  {
    id: "modulos",
    title: "Módulos ES",
    projectName: "Módulos",
    description: "import/export entre arquivos e fetch de JSON",
    icon: "account_tree",
    files: () => [
      makeFile(
        "index.html",
        `${head("Módulos")}
<body>
  <main>
    <h1>Versos</h1>
    <ol id="lista"></ol>
  </main>
  <script type="module" src="js/main.js"></script>
</body>
</html>
`
      ),
      makeFile("style.css", `body {\n  font-family: Georgia, serif;\n  max-width: 36rem;\n  margin: 3rem auto;\n  padding: 0 1rem;\n  line-height: 1.7;\n}\n\nli::marker { color: #b8860b; }\n`),
      makeFile(
        "js/main.js",
        `import { carregarVersos } from "./versos.js";
import { render } from "./ui/render.js";

const versos = await carregarVersos();
render(document.querySelector("#lista"), versos);
console.table(versos);
`
      ),
      makeFile(
        "js/versos.js",
        `export async function carregarVersos() {
  const resposta = await fetch("data/versos.json");
  return resposta.json();
}
`
      ),
      makeFile(
        "js/ui/render.js",
        `export function render(lista, versos) {
  lista.innerHTML = versos.map((v) => \`<li>\${v}</li>\`).join("");
}
`
      ),
      makeFile(
        "data/versos.json",
        `[
  "Tudo o que é sólido se faz em código",
  "e o código, lido, vira forma",
  "a forma, vista, vira mundo"
]
`
      ),
    ],
  },
];
