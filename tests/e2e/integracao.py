# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 Cauã F. O.
"""Integração entre os módulos: o inspetor grava no código só onde é inequívoco (com versão
antes no histórico), fixtures do chrome.* simulado (storage, abas e respostas), mocks de rede
no popup, fixtures de resposta com segredos mascarados e o histórico registrando cada módulo."""
import json, os, zipfile
from common import launch, check, report, setdoc, doc

ctx, page, ext, errs = launch("pinteg")
OUT = os.path.join(os.environ.get("POIESIS_PROFILES", "/tmp/poiesis-e2e"), "integ-out")
os.makedirs(OUT, exist_ok=True)

def route(r):
    acao = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*"}
    if r.request.method == "OPTIONS":
        return r.fulfill(status=204, headers=acao)
    if "/login" in r.request.url:
        return r.fulfill(status=200, headers={**acao, "Content-Type": "application/json"}, body=json.dumps({"nome": "Ana", "token": "SEGREDO123", "perfil": {"senha": "x1", "cor": "azul"}}))
    return r.fulfill(status=404, headers=acao, body="nada")
ctx.route("https://api.teste.dev/**", route)

def user():
    return page.frame_locator("iframe[title=Preview]").frame_locator("iframe")

def uframe():
    return [f for f in page.frames if f.parent_frame and f.parent_frame.parent_frame][0]

def open_file(name):
    page.keyboard.press("Escape")
    page.keyboard.press("Control+p"); page.wait_for_timeout(250)
    page.keyboard.type(name); page.wait_for_timeout(250)
    page.keyboard.press("Enter"); page.wait_for_timeout(450)

def text_of(name):
    open_file(name)
    return doc(page)

def bottom(tab):
    if not page.locator("[role=tab]", has_text=tab).count():
        page.keyboard.press("Control+j"); page.wait_for_timeout(300)
    page.locator("[role=tab]", has_text=tab).click(); page.wait_for_timeout(300)

def select(text, label):
    """Seleciona pelo campo de busca do inspetor (a árvore carrega aos poucos)."""
    page.locator("input[aria-label='Buscar elementos']").fill(text); page.wait_for_timeout(600)
    page.locator("button", has_text=label).first.click(); page.wait_for_timeout(700)
    page.locator("input[aria-label='Buscar elementos']").fill(""); page.wait_for_timeout(300)

def edit_value(prop, value):
    page.locator(f"button[aria-label='Editar {prop}']").first.click(); page.wait_for_timeout(200)
    page.keyboard.press("Control+a"); page.keyboard.type(value); page.keyboard.press("Enter"); page.wait_for_timeout(600)

def apply():
    page.locator("button[aria-label='Aplicar no código']").click(); page.wait_for_timeout(1500)

def toasts():
    return " | ".join(page.locator("[data-sonner-toast]").all_inner_texts())

HTML = """<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="style.css">
  <style>
    #titulo { font-size: 30px; }
  </style>
</head>
<body>
  <h1 id="titulo" class="grande">Olá</h1>
  <p class="texto">Primeiro</p>
  <p class="texto destaque">Segundo</p>
  <p class="dup">Duplicado</p>
  <p class="lh">Longas</p>
  <script src="script.js"></script>
</body>
</html>
"""
CSS = """.texto { color: navy; margin: 4px 0; }
p.destaque { color: rgb(200, 0, 0); }
@media (min-width: 1px) {
  .grande { letter-spacing: 1px; }
}
.dup { color: red; }
.dup { color: red; }
.lh {
  margin-top: 1px;
  margin-bottom: 1px;
  margin-left: 0;
  margin-right: 0;
}
"""

open_file("index.html"); setdoc(page, HTML)
open_file("style.css"); setdoc(page, CSS)
open_file("script.js"); setdoc(page, "// vazio\n")
page.wait_for_timeout(1500)
bottom("Elementos"); page.wait_for_timeout(500)

# ---------------------------------------------------------------- 1 inspetor → código
select("Segundo", "p.texto.destaque")
edit_value("color", "rgb(0, 0, 255)")
cb = page.locator("input[aria-label='Ligar/desligar margin']").first
cb.click(force=True); page.wait_for_timeout(600)
page.locator("button.md-chip", has_text="Estilos").last.click(); page.wait_for_timeout(200)
page.locator("input[aria-label='Nova propriedade']").fill("outline")
page.locator("input[aria-label='Valor da nova propriedade']").fill("2px dashed green")
page.keyboard.press("Enter"); page.wait_for_timeout(600)
check("botão Aplicar no código aparece com mudanças", page.locator("button[aria-label='Aplicar no código']").count() == 1)
apply()
css = text_of("style.css")
check("valor da regra gravado no arquivo certo", "p.destaque { color: rgb(0, 0, 255); }" in css, css)
check("declaração desligada vira comentário", ".texto { color: navy; /* margin: 4px 0; */ }" in css, css)
html = text_of("index.html")
check("estilo inline gravado no elemento do HTML", '<p class="texto destaque" style="outline: 2px dashed green">' in html, html)
check("o resto do HTML não mudou", html.replace(' style="outline: 2px dashed green"', "") == HTML)
check("preview recarregado com o código novo", uframe().evaluate("getComputedStyle(document.querySelector('.destaque')).color") == "rgb(0, 0, 255)")

# regra dentro de @media e regra num <style> do próprio HTML
bottom("Elementos")
select("Olá", "h1#titulo")
edit_value("letter-spacing", "3px")
edit_value("font-size", "40px")
apply()
css = text_of("style.css")
check("regra dentro de @media atualizada no lugar", "@media (min-width: 1px) {\n  .grande { letter-spacing: 3px; }\n}" in css, css)
html = text_of("index.html")
check("regra de <style> no HTML atualizada", "#titulo { font-size: 40px; }" in html, html)

# ambíguo: a mesma regra duas vezes → não grava, oferece copiar
bottom("Elementos")
select("Duplicado", "p.dup")
edit_value("color", "purple")
apply()
css = text_of("style.css")
check("regra duplicada não é gravada (ambígua)", css.count(".dup { color: red; }") == 2, css)
check("e o aviso explica e oferece copiar", "aparece 2 vezes" in toasts() and "Copiar CSS" in toasts(), toasts())

# atalho que o código escreveu por extenso: a declaração nova entra no fim do bloco
bottom("Elementos")
select("Longas", "p.lh")
edit_value("margin", "5px")
apply()
css = text_of("style.css")
check("propriedade nova entra no fim do bloco, com a indentação dele", ".lh {\n  margin-top: 1px;\n  margin-bottom: 1px;\n  margin-left: 0;\n  margin-right: 0;\n  margin: 5px;\n}" in css, css)

# desfazer pelo toast
bottom("Elementos")
select("Olá", "h1#titulo")
edit_value("font-size", "50px")
page.locator("button[aria-label='Aplicar no código']").click(); page.wait_for_timeout(500)
page.locator("[data-sonner-toast] button", has_text="Desfazer").last.dispatch_event("click"); page.wait_for_timeout(900)
check("desfazer volta o arquivo", "#titulo { font-size: 40px; }" in text_of("index.html"))

# valor que o navegador aceita mas quebraria o código: nunca escreve
bottom("Elementos")
select("Olá", "h1#titulo")
page.locator("button.md-chip", has_text="Estilos").last.click(); page.wait_for_timeout(200)
page.locator("input[aria-label='Nova propriedade']").fill("font-family")
page.locator("input[aria-label='Valor da nova propriedade']").fill('"a}b", serif')
page.keyboard.press("Enter"); page.wait_for_timeout(600)
apply()
check("valor que quebraria o código não é gravado", "a}b" not in text_of("index.html"))
check("e o motivo aparece", "quebrariam" in toasts(), toasts())

# ---------------------------------------------------------------- 2 rede: fixture com segredo mascarado
open_file("script.js")
setdoc(page, "fetch('https://api.teste.dev/login').then(r => r.json());\n"); page.wait_for_timeout(1800)
bottom("Rede")
page.locator("[role=listbox][aria-label=Requisições] [role=option]", has_text="login").first.click(); page.wait_for_timeout(300)
page.locator("button", has_text="Criar mock").click(); page.wait_for_timeout(800)
fixture = text_of("mocks/get-api-teste-dev-login.json")
check("fixture criada da resposta", '"nome": "Ana"' in fixture and '"cor": "azul"' in fixture, fixture)
check("token e senha mascarados na fixture", "SEGREDO123" not in fixture and '"x1"' not in fixture, fixture)

# ---------------------------------------------------------------- 3 histórico registra cada módulo
page.locator("nav button", has_text="Histórico").click(); page.wait_for_timeout(800)
hist = page.locator("aside").inner_text()
check("histórico: versão antes do inspetor", "Antes de aplicar" in hist and "do inspetor" in hist, hist[:500])
check("histórico: versão antes do mock", "Antes de criar um mock" in hist)

# ---------------------------------------------------------------- 4 chrome.* simulado com fixtures
page.locator("nav button", has_text="Extensão").click(); page.wait_for_timeout(400)
page.locator("button", has_text="Nova extensão…").first.click(); page.wait_for_timeout(300)
dlg = page.locator("[data-pz=new-extension]")
dlg.locator("input[aria-label='Nome da extensão']").fill("Fixtures")
dlg.locator("button", has_text="Criar extensão").click(); page.wait_for_timeout(2200)
check("rede avisa o que não aparece numa extensão", (bottom("Rede") or True) and page.locator("[data-pz=net-ext-note]").count() == 1)

page.locator("button[aria-label='Simulação do chrome.*']").click(); page.wait_for_timeout(400)
sim = page.locator("[data-pz=chrome-sim]")
sim.locator("textarea[aria-label='storage.local inicial']").fill('{ "cliques": 41 }')
sim.locator("button", has_text="Adicionar aba").click()
sim.locator("input[aria-label='URL da aba 1']").fill("https://docs.exemplo.com/guia")
sim.locator("input[aria-label='Título da aba 1']").fill("Guia")
sim.locator("button", has_text="Adicionar resposta").click()
sim.locator("input[aria-label='Id da resposta 1']").fill("contar")
sim.locator("textarea[aria-label='Mensagem da resposta 1']").fill('{ "tipo": "contar" }')
sim.locator("textarea[aria-label='Resposta 1']").fill('{ "total": 99 }')
sim.locator("button", has_text="Adicionar resposta").click()
sim.locator("input[aria-label='Id da resposta 2']").fill("sem-content")
sim.locator("select[aria-label='Destino da resposta 2']").select_option("tab")
sim.locator("textarea[aria-label='Mensagem da resposta 2']").fill('{ "tipo": "destacar" }')
sim.locator("input[aria-label='Erro da resposta 2']").fill("página protegida")
sim.locator("button", has_text="Adicionar resposta").click()
sim.locator("textarea[aria-label='Mensagem da resposta 3']").fill("{ quebrado")
sim.locator("button", has_text="Salvar").click(); page.wait_for_timeout(300)
check("JSON inválido no editor da simulação não salva", "JSON inválido" in sim.inner_text())
sim.locator("button[aria-label='Remover resposta 3']").click()
sim.locator("button", has_text="Salvar").click(); page.wait_for_timeout(1800)
check("simulação salva no arquivo do projeto", "Simulação salva" in toasts())
check("storage inicial da fixture aparece no popup", user().locator("#total").inner_text() == "41")
r = uframe().evaluate("() => chrome.runtime.sendMessage({ tipo: 'contar', extra: 1 })")
check("runtime.sendMessage recebe a resposta simulada", r == {"total": 99}, r)
r = uframe().evaluate("() => new Promise(res => chrome.runtime.sendMessage({ tipo: 'contar' }, (v) => res(v)))")
check("também no estilo callback", r == {"total": 99}, r)
r = uframe().evaluate("() => chrome.runtime.sendMessage({ tipo: 'outro' }).then(() => 'ok', e => e.message)")
check("mensagem sem resposta simulada falha como no Chrome", "Receiving end does not exist" in r, r)
r = uframe().evaluate("() => chrome.tabs.sendMessage(1, { tipo: 'destacar' }).then(() => 'ok', e => e.message)")
check("resposta simulada de erro para content script", r == "página protegida", r)
r = uframe().evaluate("() => chrome.tabs.query({ active: true, currentWindow: true }).then(t => [t.length, t[0].id, t[0].url === undefined])")
check("aba fictícia da fixture (sem url sem a permissão tabs)", r == [1, 1, True], r)
bottom("Console")
check("console diz que a resposta foi simulada", "resposta simulada por “contar”" in page.locator("body").inner_text())

# inspetor funciona dentro do popup simulado
bottom("Elementos"); page.wait_for_timeout(500)
page.locator("input[aria-label='Buscar elementos']").fill("Contar"); page.wait_for_timeout(600)
check("inspetor enxerga o popup simulado", page.locator("button", has_text="button#contar").count() >= 1)
page.locator("input[aria-label='Buscar elementos']").fill("")

# ZIP: a fixture não vai junto
page.locator("nav button", has_text="Extensão").click() if not page.locator("[data-pz=extension-panel]").count() else None
page.wait_for_timeout(300)
with page.expect_download() as d:
    page.locator("[data-pz=extension-panel] button", has_text="Exportar extensão (.zip)").click()
    page.wait_for_timeout(400)
    if page.locator("[data-pz=export-extension]").count():
        page.locator("[data-pz=export-extension] button", has_text="Exportar").last.click()
zp = os.path.join(OUT, "fixtures.zip"); d.value.save_as(zp)
names = zipfile.ZipFile(zp).namelist()
check("poiesis.chrome.json fica fora do ZIP", "poiesis.chrome.json" not in names and "manifest.json" in names, names)
fx = json.loads(text_of("poiesis.chrome.json"))
check("arquivo de fixtures legível e versionado", fx["version"] == 1 and fx["messages"][0]["id"] == "contar" and fx["tabs"][0]["url"] == "https://docs.exemplo.com/guia")

# mocks de rede valem para o popup da extensão
page.keyboard.press("Escape")
page.keyboard.press("Control+k"); page.wait_for_timeout(250)
page.keyboard.type("Editar mocks"); page.wait_for_timeout(250); page.keyboard.press("Enter"); page.wait_for_timeout(500)
page.locator("button", has_text="Editar o JSON").click(); page.wait_for_timeout(700)
setdoc(page, json.dumps({"version": 1, "enabled": True, "mocks": [{"id": "dados", "method": "GET", "url": "https://api.exemplo.com/dados", "status": 200, "headers": {"Content-Type": "application/json"}, "body": "{\"ok\": 1}"}]}, indent=2)); page.wait_for_timeout(1800)
open_file("popup.html"); page.wait_for_timeout(1200)
r = uframe().evaluate("() => fetch('https://api.exemplo.com/dados').then(r => r.json())")
check("mock de rede responde ao fetch do popup", r == {"ok": 1}, r)

report(errs, ignore=["addEventListener", "dataset"])
