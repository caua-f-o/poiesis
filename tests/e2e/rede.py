# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 Cauã F. O.
"""Painel de Rede e APIs: captura, diagnóstico, mascaramento, mocks, console de APIs e segurança.
A "internet" é simulada com rotas do Playwright (https://api.teste.dev)."""
import json, os
from common import launch, check, report, setdoc

ctx, page, ext, errs = launch("prede")

def route(r):
    url = r.request.url
    acao = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*"}
    if r.request.method == "OPTIONS":
        return r.fulfill(status=204, headers=acao)
    if "/ok" in url:
        return r.fulfill(status=200, headers={**acao, "Content-Type": "application/json", "Set-Cookie": "sessao=SEGREDO_COOKIE"}, body=json.dumps({"itens": [1, 2, 3], "nome": "Poiesis"}))
    if "/cors" in url:
        return r.fulfill(status=200, headers={"Content-Type": "application/json"}, body="{}")
    if "/500" in url:
        return r.fulfill(status=500, headers={**acao, "Content-Type": "text/plain"}, body="falhou")
    if "/xss" in url:
        return r.fulfill(status=200, headers={**acao, "Content-Type": "text/html"}, body='<img src=x onerror="window.top.__pwned=1"><script>window.top.__pwned=2</script>')
    if "/echo" in url:
        return r.fulfill(status=200, headers={**acao, "Content-Type": "application/json"}, body=json.dumps({"method": r.request.method, "auth": r.request.headers.get("authorization"), "body": r.request.post_data}))
    if "/img.png" in url:
        return r.fulfill(status=200, headers={**acao, "Content-Type": "image/png"}, body=b"\x89PNG\r\n\x1a\n")
    return r.fulfill(status=404, headers=acao, body="nada")
ctx.route("https://api.teste.dev/**", route)

def user():
    return [f for f in page.frames if f.parent_frame and f.parent_frame.parent_frame][0]

def show_network():
    tab = page.locator("[role=tab]", has_text="Rede")
    if tab.count() == 0:
        page.keyboard.press("Control+j"); page.wait_for_timeout(300)
    page.locator("[role=tab]", has_text="Rede").click(); page.wait_for_timeout(300)

def rows():
    return page.locator("[role=listbox][aria-label=Requisições] [role=option]")

def row(text):
    return rows().filter(has_text=text).first

def ev(js):
    try:
        return user().evaluate(js)
    except Exception as e:
        return "ERR:" + str(e)[:120]

def open_row(text, tab=None):
    r = row(text)
    if r.get_attribute("aria-selected") != "true":
        r.click(); page.wait_for_timeout(250)
    if tab:
        page.locator("button.md-chip", has_text=tab).last.click(); page.wait_for_timeout(250)

def detail_text():
    return page.locator("[role=listbox][aria-label=Requisições] + div").inner_text()

# preparar projeto: arquivo de dados + página simples
page.locator("aside button.md-item", has_text="index.html").click(); page.wait_for_timeout(300)
setdoc(page, '<!DOCTYPE html><html><body><h1>Rede</h1><img src="https://api.teste.dev/img.png"></body></html>')
page.wait_for_timeout(1500)
show_network()

# 1 fetch com JSON
ev("fetch('https://api.teste.dev/ok?access_token=abc123', { headers: { Authorization: 'Bearer TOKEN_SECRETO', 'X-Teste': '1' } }).then(r => r.json())")
page.wait_for_timeout(800)
check("fetch aparece no registro", row("ok").count() == 1)
check("status 200", "200" in row("ok").inner_text())
check("token da URL mascarado na lista", "abc123" not in row("ok").inner_text(), row("ok").inner_text())
open_row("ok", "Cabeçalhos")
t = detail_text()
check("Authorization mascarado por padrão", "TOKEN_SECRETO" not in t and "Bearer ••••••" in t, t[:300])
check("Set-Cookie da resposta mascarado", "SEGREDO_COOKIE" not in t)
page.locator("button[aria-label^='Mostrar dados sensíveis']").click(); page.wait_for_timeout(200)
check("revelar mostra o valor", "TOKEN_SECRETO" in detail_text())
page.locator("button[aria-label='Mascarar dados sensíveis']").click(); page.wait_for_timeout(200)
open_row("ok", "Resposta")
check("resposta JSON formatada", '"itens"' in detail_text() and '"nome": "Poiesis"' in detail_text())
open_row("ok", "Resumo")
check("diagnóstico OK", "HTTP 200" in detail_text())

# 2 CORS e 500
# (respostas simuladas pelo Playwright pulam o CORS; um host inexistente reproduz o erro opaco)
ev("fetch('https://nao-existe.invalid/cors').catch(() => 0)")
ev("fetch('https://api.teste.dev/500').catch(() => 0)")
page.wait_for_timeout(1000)
check("falha de CORS identificada", "CORS" in row("cors").inner_text())
open_row("cors", "Resumo")
check("diagnóstico explica CORS e origem null", "Provável bloqueio de CORS" in detail_text() and "null" in detail_text())
open_row("500", "Resumo")
check("HTTP 500 = erro no servidor", "erro no servidor" in detail_text())
page.locator("button.md-chip", has_text="Erros").first.click(); page.wait_for_timeout(200)
check("filtro de erros", rows().count() == 2, rows().count())
page.locator("button.md-chip", has_text="Tudo").first.click(); page.wait_for_timeout(200)

# 3 arquivos do projeto por fetch e XHR (sem rede)
page.locator("button[aria-label='Novo arquivo']").first.click(); page.wait_for_timeout(300)
page.keyboard.type("dados.json"); page.keyboard.press("Enter"); page.wait_for_timeout(400)
setdoc(page, '{"origem": "projeto", "cifrao": "$& $\' $` $$"}'); page.wait_for_timeout(1500)
show_network()
x = ev("new Promise(r => { const x = new XMLHttpRequest(); x.open('GET', 'dados.json'); x.onload = () => r(x.status + ' ' + x.responseText); x.send(); })")
check("XHR lê arquivo do projeto", x.startswith('200 {"origem": "projeto"'), x)
check("conteúdo com $& $' intacto no preview", x.endswith('"cifrao": "$& $\' $` $$"}'), x)
page.wait_for_timeout(500)
check("XHR registrado como projeto", "projeto" in row("dados.json").inner_text().lower())
check("recurso de <img> observado sem detalhes", rows().filter(has_text="img.png").count() >= 1)

# 4 mocks pela interface
page.locator("button[aria-label=Mocks]").click(); page.wait_for_timeout(400)
page.locator("[role=dialog] button", has_text="Novo mock").click(); page.wait_for_timeout(200)
dlg = page.locator("[role=dialog]")
dlg.locator("input[placeholder^='/api/usuarios']").fill("/api/usuarios/*")
dlg.locator("textarea").first.fill('{"id": 7, "nome": "Ana"}')
dlg.locator("label:has-text('Latência') input").fill("300")
page.locator("[role=dialog] button", has_text="Salvar mocks").click(); page.wait_for_timeout(1500)
show_network()
r = ev("fetch('/api/usuarios/7').then(r => r.json()).then(j => j.nome)")
check("mock responde fetch", r == "Ana", r)
for _ in range(20):
    if row("7").count() and "mock" in row("7").inner_text().lower():
        break
    page.wait_for_timeout(100)
check("entrada marcada como mock", "mock" in row("7").inner_text().lower())
d = ev("(async () => { const t = performance.now(); await fetch('/api/usuarios/1'); return performance.now() - t; })()")
check("latência simulada (~300 ms)", isinstance(d, (int, float)) and d >= 280, d)
r = ev("new Promise(r => { const x = new XMLHttpRequest(); x.open('GET', '/api/usuarios/9'); x.responseType = 'json'; x.onload = () => r(x.response.nome); x.send(); })")
check("mock responde XHR", r == "Ana", r)
check("arquivo de mocks no projeto", page.locator("aside button.md-item", has_text="poiesis.mocks.json").count() == 1)

# 5 offline: mock continua, rede não
ctx.set_offline(True)
r = ev("fetch('/api/usuarios/2').then(r => r.json()).then(j => j.nome)")
check("mock funciona offline", r == "Ana", r)
ev("fetch('https://nao-existe.invalid/offline').catch(() => 0)")
page.wait_for_timeout(600)
ctx.set_offline(False)
last_ok = rows().filter(has_text="offline").last
check("offline diagnosticado", "erro" in last_ok.inner_text().lower() or "cors" in last_ok.inner_text().lower())
last_ok.click(); page.wait_for_timeout(200)
page.locator("button.md-chip", has_text="Resumo").last.click(); page.wait_for_timeout(200)
check("mensagem de sem conexão", "Sem conexão" in detail_text(), detail_text()[:200])

# 6 mock com falha de rede e timeout (editando o JSON)
mocks = {"version": 1, "enabled": True, "mocks": [
    {"id": "falha", "method": "GET", "url": "/api/falha", "status": 200, "delay": 50, "error": "network"},
    {"id": "lento", "method": "POST", "url": "https://api.teste.dev/lento/**", "delay": 200, "error": "timeout"},
    {"id": "ruim", "method": "PATCHX", "url": "/x"},
    {"id": "atraso", "url": "/atraso", "delay": 9999999},
]}
page.locator("aside button.md-item", has_text="poiesis.mocks.json").click(); page.wait_for_timeout(300)
setdoc(page, json.dumps(mocks, indent=2)); page.wait_for_timeout(1500)
show_network()
r = ev("fetch('/api/falha').then(() => 'ok', e => e.name)")
check("mock de falha de rede rejeita como TypeError", r == "TypeError", r)
r = ev("fetch('https://api.teste.dev/lento/a/b', { method: 'POST' }).then(() => 'ok', e => e.name)")
check("mock de timeout rejeita como TimeoutError", r == "TimeoutError", r)
r = ev("new Promise(res => { const ac = new AbortController(); fetch('/api/falha', { signal: ac.signal }).then(() => res('ok'), e => res(e.name)); ac.abort(); })")
check("AbortController cancela mock", r == "AbortError", r)
page.locator("button[aria-label=Mocks]").click(); page.wait_for_timeout(400)
dt = page.locator("[role=dialog]").inner_text()
check("mock inválido apontado e descartado", "PATCHX" in dt and "inválido" in dt)
page.keyboard.press("Escape"); page.wait_for_timeout(300)

# 7 criar mock a partir de resposta real
show_network()
ev("fetch('https://api.teste.dev/ok').then(r => r.json())"); page.wait_for_timeout(600)
rows().filter(has_text="ok").last.click(); page.wait_for_timeout(250)
page.locator("button", has_text="Criar mock").click(); page.wait_for_timeout(1500)
check("fixture criada em mocks/", page.locator("aside").inner_text().count("get-api-teste-dev-ok") >= 1)
show_network()
ctx.set_offline(True)
r = ev("fetch('https://api.teste.dev/ok').then(r => r.json()).then(j => j.itens.length)")
ctx.set_offline(False)
check("mock da resposta capturada funciona offline", r == 3, r)

# 8 console de APIs
page.locator("button[aria-label='Nova requisição']").click(); page.wait_for_timeout(300)
d = page.locator("[role=dialog]")
d.locator("select[aria-label=Método]").select_option("POST")
d.locator("input[aria-label=URL]").fill("https://api.teste.dev/echo")
d.locator("button", has_text="Adicionar").click()
d.locator("input[aria-label='Nome do cabeçalho']").last.fill("Authorization")
d.locator("input[aria-label='Valor do cabeçalho']").last.fill("Bearer DO_CONSOLE")
check("valor de cabeçalho sensível digitado como senha", d.locator("input[aria-label='Valor do cabeçalho']").last.get_attribute("type") == "password")
d.locator("textarea").fill('{"a": 1}')
d.locator("button", has_text="Enviar").click(); page.wait_for_timeout(1200)
t = detail_text()
check("console de APIs envia e mostra a resposta", '"method": "POST"' in t and '"a": 1' in t.replace('\\"', '"'), t[:300])
check("entrada marcada como console", "console" in rows().filter(has_text="echo").last.inner_text().lower())

# 9 segurança
before = rows().count()
user().evaluate("""() => parent.postMessage({ __poiesis: 1, v: 1, s: 'x', type: 'net', e: { id: 'forjado', kind: 'fetch', method: 'GET', url: 'https://mal.example/', reqHeaders: [], resHeaders: [], reqBody: { t: 'none', size: 0 } } }, '*')""")
page.wait_for_timeout(400)
check("registro forjado com sessão errada é ignorado", rows().filter(has_text="mal.example").count() == 0)
ev("fetch('https://api.teste.dev/xss').then(r => r.text())"); page.wait_for_timeout(700)
open_row("xss", "Resposta")
check("resposta HTML mostrada como texto", "<img src=x" in detail_text())
check("nada executa no editor (XSS)", page.evaluate("() => window.__pwned === undefined && !document.querySelector('img[src=x]')"))
# sandbox → página: net-send com URL perigosa
sandbox = [f for f in page.frames if f.parent_frame == page.main_frame and "sandbox" in f.url][0]
n0 = rows().count()
sandbox.evaluate("""() => { const f = document.querySelector('iframe'); f.contentWindow.postMessage({ __poiesisNetSend: { method: 'GET', url: 'javascript:alert(1)' } }, '*');
  f.contentWindow.postMessage({ __poiesisNetSend: { method: 'TRACE', url: 'https://api.teste.dev/ok' } }, '*'); }""")
page.wait_for_timeout(500)
check("console de APIs recusa javascript: e método inválido", rows().count() == n0, (n0, rows().count()))
# iframe de terceiro dentro da página não consegue disparar requisições pelo console
user().evaluate("""() => { const f = document.createElement('iframe'); f.srcdoc = "<script>parent.postMessage({ __poiesisNetSend: { method: 'GET', url: 'https://api.teste.dev/ok?intruso=1' } }, '*')<\\/script>"; document.body.appendChild(f); }""")
page.wait_for_timeout(600)
check("iframe de terceiro não usa o console de APIs", rows().filter(has_text="intruso").count() == 0)
# campos gigantes são cortados
ev("fetch('https://api.teste.dev/echo', { method: 'POST', body: 'x'.repeat(600000) }).catch(() => 0)"); page.wait_for_timeout(800)
rows().filter(has_text="echo").last.click(); page.wait_for_timeout(250)
page.locator("button.md-chip", has_text="Envio").last.click(); page.wait_for_timeout(250)
check("corpo grande truncado com aviso", "primeiros 256 KB" in detail_text())

# 10 export HAR mascarado
with page.expect_download() as dl:
    page.locator("button[aria-label^='Exportar HAR']").click()
har = open(dl.value.path()).read()
check("HAR exportado sem segredos", "TOKEN_SECRETO" not in har and "DO_CONSOLE" not in har and "abc123" not in har and "SEGREDO_COOKIE" not in har and '"version": "1.2"' in har)

# 11 limites e isolamento entre projetos
import time as _t
t0 = _t.time()
ev("Promise.all(Array.from({ length: 3000 }, (_, i) => fetch('/api/usuarios/' + i)))"); page.wait_for_timeout(1500)
t1 = _t.time(); page.evaluate("() => 1"); lag = _t.time() - t1
check("rajada de 3000 requisições não trava o editor", lag < 1.0, round(lag, 3))
check("registro limitado a 500 entradas", rows().count() <= 500, rows().count())
page.locator("button[aria-pressed]", has_text="Projetos").first.click(); page.wait_for_timeout(300)
page.locator("button", has_text="Em branco").first.click(); page.wait_for_timeout(1500)
show_network()
check("outro projeto começa sem registro", rows().count() == 0, rows().count())
b = page.locator("button[aria-pressed]", has_text="Projetos").first
if b.get_attribute("aria-pressed") != "true": b.click(); page.wait_for_timeout(300)
page.locator("aside button.md-item", has_text="Gênese").first.click(); page.wait_for_timeout(1200)
show_network()
check("registro não é persistido nem misturado", rows().filter(has_text="Em branco").count() == 0)
nothing = page.evaluate("""async () => { const db = await new Promise(r => { const q = indexedDB.open('poiesis'); q.onsuccess = () => r(q.result); });
  const ps = await new Promise(r => { const q = db.transaction('projects').objectStore('projects').getAll(); q.onsuccess = () => r(q.result); }); db.close();
  return JSON.stringify(ps).includes('TOKEN_SECRETO'); }""")
check("tokens nunca vão para o armazenamento", nothing is False)

report(errs, ignore=["addEventListener", "dataset"])
