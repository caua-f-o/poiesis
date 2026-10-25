# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 Cauã F. O.
"""Inspetor visual: seleção no preview, árvore, estilos, estados forçados, edição
temporária, vínculo código ↔ preview e segurança."""
from common import launch, check, report, setdoc, doc, V

ctx, page, ext, errs = launch("pinsp")

HTML = """<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main class="cena">
    <h1 id="titulo" class="grande">Olá</h1>
    <p class="texto">Primeiro</p>
    <p class="texto destaque">Segundo</p>
    <button id="b">Botão</button>
  </main>
  <script>
    const n = document.createElement('section'); n.className = 'gerado'; n.textContent = 'feito por script'; document.body.appendChild(n);
    document.getElementById('b').addEventListener('click', () => { window.cliques = (window.cliques || 0) + 1; });
  </script>
</body>
</html>"""
CSS = """:root { --cor: rgb(10, 20, 30); }
.cena { padding: 12px; }
.texto { color: var(--cor); margin: 4px 0; }
p.destaque { color: rgb(200, 0, 0); }
#titulo { font-size: 30px; }
button:hover { background: rgb(0, 128, 0); }
@media (min-width: 1px) { .grande { letter-spacing: 1px; } }
"""

def user():
    return [f for f in page.frames if f.parent_frame and f.parent_frame.parent_frame][0]

def open_file(name):
    page.locator("aside button.md-item", has_text=name).first.click(); page.wait_for_timeout(350)

def panel():
    return page.locator("[role=tree]").locator("xpath=ancestor::div[contains(@class,'flex h-full flex-col')][1]")

def ptext():
    return page.locator("[role=tree]").locator("xpath=ancestor::div[contains(@class,'h-full')][1]").inner_text()

def detail():
    return page.locator("[data-pz=inspector-detail]").inner_text()

def click_in_preview(selector):
    fr = page.frame_locator("iframe[title=Preview]").frame_locator("iframe")
    box = fr.locator(selector).bounding_box()
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2); page.wait_for_timeout(150)
    page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2); page.wait_for_timeout(600)

open_file("index.html"); setdoc(page, HTML)
open_file("style.css"); setdoc(page, CSS)
page.wait_for_timeout(1500)
check("sem inspetor: cliques chegam à página", user().evaluate("document.getElementById('b').click(), window.cliques") == 1)

# 1 seleção pelo preview
page.keyboard.press("Escape")
page.locator("button[aria-label='Selecionar elemento para inspecionar']").click(); page.wait_for_timeout(500)
check("abre a aba Elementos", page.locator("[role=tab][aria-selected=true]", has_text="Elementos").count() == 1)
fr = page.frame_locator("iframe[title=Preview]").frame_locator("iframe")
box = fr.locator("#b").bounding_box()
page.mouse.move(box["x"] + 5, box["y"] + 5); page.wait_for_timeout(300)
check("contorno ao passar o mouse", user().evaluate("!!document.querySelector('poiesis-inspector')"))
page.mouse.click(box["x"] + 5, box["y"] + 5); page.wait_for_timeout(700)
check("clique durante a seleção não dispara o app", user().evaluate("window.cliques") == 1)
t = page.locator("[data-pz=inspector]").inner_text()
check("botão selecionado com breadcrumb", "button#b" in t and "main.cena" in t, t[:200])
check("seleção termina sozinha", user().evaluate("document.getElementById('b').click(), window.cliques") == 2)

# 2 árvore: abre ancestrais e marca dinâmico
tree = page.locator("[role=tree]").inner_text()
check("árvore mostra o caminho até o elemento", "<main" in tree and "<button" in tree)
page.locator("[role=treeitem]", has_text="<body").first.click(); page.wait_for_timeout(600)
tree = page.locator("[role=tree]").inner_text()
check("elemento criado por script marcado como dinâmico", "dinâmico" in tree.lower() and "gerado" in tree, tree[-300:])
check("script do runtime e estilos injetados ficam fora da árvore", "data-poiesis-runtime" not in tree and "poiesis-inspector" not in tree)

# 3 estilos aplicados, sobrescritos e variáveis
page.locator("[role=treeitem]", has_text="destaque").first.click(); page.wait_for_timeout(700)
st = page.locator("button.md-chip", has_text="Estilos").last
st.click(); page.wait_for_timeout(300)
body = detail()
check("regras do arquivo aparecem com seletor e arquivo", "p.destaque" in body and ".texto" in body and "style.css" in body, body[:400])
over = page.locator("span.line-through", has_text="color")
check("cor da regra menos específica aparece riscada", over.count() >= 1)
page.locator("button.md-chip", has_text="Calculado").last.click(); page.wait_for_timeout(300)
calc = detail()
check("calculado mostra a cor final", "rgb(200, 0, 0)" in calc)
check("variável CSS usada resolvida", "--cor" in calc and "rgb(10, 20, 30)" in calc, calc[:300])
page.locator("button.md-chip", has_text="Caixa").last.click(); page.wait_for_timeout(300)
check("modelo de caixa", "margin" in detail() and "padding" in detail() and "×" in detail())

# 4 edição temporária e cópia do CSS
page.locator("button.md-chip", has_text="Estilos").last.click(); page.wait_for_timeout(300)
page.locator("input[aria-label='Nova propriedade']").fill("outline")
page.locator("input[aria-label='Valor da nova propriedade']").fill("3px solid blue")
page.keyboard.press("Enter"); page.wait_for_timeout(600)
check("estilo inline aplicado no preview", user().evaluate("getComputedStyle(document.querySelector('.destaque')).outlineStyle") == "solid")
page.locator("button[aria-label='Editar color']").first.click(); page.wait_for_timeout(200)
page.keyboard.press("Control+a"); page.keyboard.type("rgb(0, 0, 255)"); page.keyboard.press("Enter"); page.wait_for_timeout(700)
check("editar valor da regra muda o preview", user().evaluate("getComputedStyle(document.querySelector('.destaque')).color") == "rgb(0, 0, 255)")
ctx.grant_permissions(["clipboard-read", "clipboard-write"])
page.locator("button", has_text="2").filter(has=page.locator(".msr", has_text="content_copy")).click(); page.wait_for_timeout(500)
clip = page.evaluate("navigator.clipboard.readText()")
check("copiar CSS das mudanças", "outline:" in clip and "solid" in clip and "color: rgb(0, 0, 255)" in clip and "p.destaque" in clip, clip)
open_file("style.css")
check("edição temporária não toca no arquivo", "rgb(200, 0, 0)" in doc(page))

# 5 desligar declaração
page.locator("[role=tab]", has_text="Elementos").click(); page.wait_for_timeout(300)
cb = page.locator("input[aria-label='Ligar/desligar margin']").first
cb.click(force=True); page.wait_for_timeout(700)
mt = user().evaluate("getComputedStyle(document.querySelector('.destaque')).marginTop")
check("desligar declaração remove o efeito", mt != "4px", mt)

# 6 estado forçado
page.locator("[role=treeitem]", has_text="<button").first.click(); page.wait_for_timeout(600)
page.locator("button.md-chip", has_text=":hover").click(); page.wait_for_timeout(600)
check(":hover forçado aplica a regra", user().evaluate("getComputedStyle(document.getElementById('b')).backgroundColor") == "rgb(0, 128, 0)")
page.locator("button.md-chip", has_text=":hover").click(); page.wait_for_timeout(500)
check("desligar o estado volta ao normal", user().evaluate("getComputedStyle(document.getElementById('b')).backgroundColor") != "rgb(0, 128, 0)")

# 7 preview → código
page.locator("[role=treeitem]", has_text="titulo").first.click(); page.wait_for_timeout(600)
page.locator("button", has_text="Ver no código").click(); page.wait_for_timeout(600)
line = page.evaluate(f"() => {{ const v={V}; return v.state.doc.lineAt(v.state.selection.main.head).text }}")
check("Ver no código vai para a tag no HTML", '<h1 id="titulo"' in line, line)
page.locator("[role=tab]", has_text="Elementos").click(); page.wait_for_timeout(300)
page.locator("button[title='Abrir a regra no código']").first.click(); page.wait_for_timeout(600)
line = page.evaluate(f"() => {{ const v={V}; return v.state.doc.lineAt(v.state.selection.main.head).text }}")
check("arquivo da regra abre na linha do seletor", line.startswith("#titulo") or line.strip().startswith("@media") or ".grande" in line, line)

# 8 código → preview
open_file("index.html")
page.evaluate(f"() => {{ const v={V}; const i=v.state.doc.toString().indexOf('Segundo'); v.dispatch({{selection:{{anchor:i}}}}); v.focus(); }}")
page.keyboard.press("Control+Shift+C"); page.wait_for_timeout(900)
crumb = page.locator("[data-pz=inspector]").inner_text()
check("Ctrl+Shift+C no HTML seleciona o elemento no preview", "p.texto.destaque" in crumb, crumb[:300])

# 9 reselecionar depois de recarregar
page.keyboard.press("Control+r"); page.wait_for_timeout(1800)
crumb = page.locator("[data-pz=inspector]").inner_text()
check("depois de recarregar, o mesmo elemento continua selecionado", "p.texto.destaque" in crumb, crumb[:200])

# 10 busca
page.locator("input[aria-label='Buscar elementos']").fill("botão"); page.wait_for_timeout(600)
check("busca por texto encontra o elemento", page.locator("button", has_text="button#b").count() >= 1)
page.locator("input[aria-label='Buscar elementos']").fill("")

# 11 segurança
uf = user()
uf.evaluate("""() => parent.postMessage({ __poiesis: 1, v: 1, s: 'falsa', type: 'inspect', ev: 'node', data: { node: { id: 1, type: 'el', tag: 'forjado' } } }, '*')""")
page.wait_for_timeout(300)
check("mensagem do inspetor com sessão errada é ignorada", "forjado" not in page.locator("[data-pz=inspector]").inner_text())
uf.evaluate("""() => { const d = document.createElement('div'); d.id = 'x'; d.setAttribute('data-evil', '<img src=x onerror="window.top.__pwned=1">'); d.className = '<b>negrito</b>'; d.textContent = '<script>window.top.__pwned=2</script>'; document.body.appendChild(d); }""")
page.locator("input[aria-label='Buscar elementos']").fill("div#x"); page.wait_for_timeout(500)
page.locator("button", has_text="div#x").first.click(); page.wait_for_timeout(600)
page.locator("button.md-chip", has_text="Atributos").last.click(); page.wait_for_timeout(300)
check("atributos maliciosos mostrados como texto", page.locator("text=onerror=").count() >= 1)
check("nada executa no editor", page.evaluate("() => window.__pwned === undefined && !document.querySelector('b') "))
uf.evaluate("""() => { const f = document.createElement('iframe'); f.srcdoc = "<script>parent.postMessage({ __poiesisInspect: { op: 'pick' } }, '*')<\\/script>"; document.body.appendChild(f); }""")
page.wait_for_timeout(500)
check("iframe de terceiro não liga o inspetor", uf.evaluate("!document.getElementById('__pz_cursor')"))
page.locator("input[aria-label='Buscar elementos']").fill("")

# 12 desligar: nada fica escutando
page.locator("button[aria-label='Selecionar elemento no preview']").click(); page.wait_for_timeout(300)
page.keyboard.press("Escape"); page.wait_for_timeout(300)
uf.evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))")
check("Esc cancela a seleção", uf.evaluate("!document.getElementById('__pz_cursor')"))

report(errs, ignore=["addEventListener", "dataset"])
