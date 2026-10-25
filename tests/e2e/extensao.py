# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 Cauã F. O.
"""Extension Studio: modelos, formulário ↔ JSON, validação com correções, preview simulado,
exportação e — de verdade — a extensão exportada carregada num Chromium, inclusive uma
extensão complementar conversando com a principal."""
import hashlib, json, os, shutil, time, zipfile
import common
from common import launch, check, report, setdoc, doc

ctx, page, ext, errs = launch("pext")
WORK = os.path.join(os.environ.get("POIESIS_PROFILES", "/tmp/poiesis-e2e"), "ext-out")
shutil.rmtree(WORK, ignore_errors=True); os.makedirs(WORK)

def ext_id(path):
    """ID que o Chromium dá a uma extensão descompactada: SHA-256 do caminho, letras a–p."""
    h = hashlib.sha256(os.path.abspath(path).encode()).hexdigest()[:32]
    return h.translate(str.maketrans("0123456789abcdef", "abcdefghijklmnop"))

def user():
    return page.frame_locator("iframe[title=Preview]").frame_locator("iframe")

def panel():
    show_panel()
    return page.locator("[data-pz=extension-panel]")

def open_file(name):
    """Abre pelo Ctrl+P (nome exato), sem depender do painel lateral."""
    page.keyboard.press("Escape")
    page.keyboard.press("Control+p"); page.wait_for_timeout(250)
    page.keyboard.type(name); page.wait_for_timeout(250)
    page.keyboard.press("Enter"); page.wait_for_timeout(450)

def show_panel():
    if not page.locator("[data-pz=extension-panel]").count():
        page.locator("nav button", has_text="Extensão").click(); page.wait_for_timeout(400)

def json_mode():
    page.locator("[role=tablist][aria-label='Modo do manifesto'] [role=tab]", has_text="JSON").click(); page.wait_for_timeout(300)

def form_mode():
    page.locator("[role=tablist][aria-label='Modo do manifesto'] [role=tab]", has_text="Formulário").click(); page.wait_for_timeout(300)

def new_extension(name, parts=(), companion=None, matches=None):
    show_panel()
    page.locator("button[aria-label='Nova extensão']").first.click() if page.locator("button[aria-label='Nova extensão']").count() else page.locator("button", has_text="Nova extensão…").first.click()
    page.wait_for_timeout(300)
    dlg = page.locator("[data-pz=new-extension]")
    dlg.locator("input[aria-label='Nome da extensão']").fill(name)
    for t in parts:
        dlg.locator("label", has_text=t).locator("input").check()
    if matches:
        dlg.locator("input[aria-label='Páginas do content script']").fill(matches)
    if companion:
        dlg.locator("[role=radio]", has_text=companion).click()
    dlg.locator("button", has_text="Criar extensão").click(); page.wait_for_timeout(2200)

def manifest_text():
    open_file("manifest.json"); json_mode()
    return doc(page)

def export(dest):
    show_panel()
    with page.expect_download() as d:
        panel().locator("button", has_text="Exportar extensão (.zip)").click()
        page.wait_for_timeout(400)
        if page.locator("[data-pz=export-extension]").count():
            page.locator("[data-pz=export-extension] button", has_text="Exportar").last.click()
    d.value.save_as(dest)
    return dest

def unzip(src, folder):
    shutil.rmtree(folder, ignore_errors=True)
    with zipfile.ZipFile(src) as z:
        z.extractall(folder)
    return folder

# ---------------------------------------------------------------- 1 painel e modelo
page.locator("nav button", has_text="Extensão").click(); page.wait_for_timeout(400)
check("painel Extensão oferece criar", page.locator("button", has_text="Nova extensão…").count() >= 1)
# projeto comum vira extensão: a página principal vira o popup
panel().locator("button", has_text="Transformar este projeto em extensão").click(); page.wait_for_timeout(900)
mg = json.loads(doc(page))
check("transformar projeto cria manifest com o popup", mg["manifest_version"] == 3 and mg["action"]["default_popup"] == "index.html", mg)
check("sem ícones: aviso, mas dá para exportar", "pode exportar" in panel().inner_text() and "ícone de 128" in panel().inner_text())
# mensagens forjadas (sessão errada) não mexem no preview
fr = page.frame_locator("iframe[title=Preview]").frame_locator("iframe")
before = page.locator("[data-pz=ext-frame]").bounding_box()
fr.locator("body").evaluate("() => parent.postMessage({ __poiesis: 1, v: 1, s: 'falsa', type: 'ext-size', w: 790, h: 590 }, '*')"); page.wait_for_timeout(400)
check("ext-size com sessão errada é ignorado", page.locator("[data-pz=ext-frame]").bounding_box() == before)
new_extension("Estúdio Teste", parts=["Página de opções", "Painel lateral", "Content script"], matches="https://example.com/*")
check("cria o projeto e abre o formulário do manifesto", page.locator("[data-pz=manifest-form]").count() == 1)
check("extensão nova sem erros", "Pronta para exportar" in panel().inner_text(), panel().inner_text()[:300])
m = json.loads(doc(page))
check("manifesto MV3 do modelo", m["manifest_version"] == 3 and m["action"]["default_popup"] == "popup.html" and m["background"]["service_worker"] == "background.js" and m["side_panel"]["default_path"] == "sidepanel.html", m)
check("permissões mínimas do modelo", sorted(m["permissions"]) == ["sidePanel", "storage"], m.get("permissions"))
check("ícones PNG ligados no manifesto", m["icons"] == {str(s): f"icons/icon-{s}.png" for s in (16, 32, 48, 128)})

# ---------------------------------------------------------------- 2 formulário ↔ JSON
form = page.locator("[data-pz=manifest-form]")
form.locator("input[aria-label='Nome']").fill("Estúdio <b>Teste</b>")
form.locator("input[aria-label='Versão']").fill("1.2.0")
page.wait_for_timeout(400)
m = json.loads(doc(page))
check("formulário grava no JSON", m["name"] == "Estúdio <b>Teste</b>" and m["version"] == "1.2.0", m.get("name"))
check("nome com HTML aparece como texto", "Estúdio <b>Teste</b>" in panel().inner_text())
json_mode()
m["commands"] = {"_execute_action": {"suggested_key": {"default": "Ctrl+Shift+Y"}}}
m["x_campo_meu"] = 1
setdoc(page, json.dumps(m, indent=2, ensure_ascii=False) + "\n"); page.wait_for_timeout(700)
form_mode()
check("campos desconhecidos listados no formulário", "commands" in form.inner_text() and "x_campo_meu" in form.inner_text())
check("chave desconhecida vira aviso com sugestão", "x_campo_meu" in panel().inner_text())
form.locator("textarea[aria-label='Descrição']").fill("Descrição nova")
page.wait_for_timeout(400)
m = json.loads(doc(page))
check("editar pelo formulário preserva campos desconhecidos", m["description"] == "Descrição nova" and "commands" in m and m["x_campo_meu"] == 1)
json_mode()
del m["x_campo_meu"]
setdoc(page, json.dumps(m, indent=2, ensure_ascii=False) + "\n"); page.wait_for_timeout(500)

# JSON inválido: o formulário não sobrescreve nada
bad = doc(page).replace('"version": "1.2.0",', '"version": "1.2.0"')
setdoc(page, bad); page.wait_for_timeout(500)
form_mode()
check("JSON inválido: formulário pede para corrigir no JSON", "precisa de um JSON válido" in form.inner_text())
json_mode(); setdoc(page, json.dumps(m, indent=2, ensure_ascii=False) + "\n"); page.wait_for_timeout(500)

# ---------------------------------------------------------------- 3 validação e correções
# permissão faltando para chrome.storage
m2 = dict(m); m2["permissions"] = ["sidePanel"]
setdoc(page, json.dumps(m2, indent=2, ensure_ascii=False) + "\n"); page.wait_for_timeout(900)
t = panel().inner_text()
check("chrome.storage sem permissão é erro", "permissão “storage” não está no manifesto" in t, t[:600])
panel().locator("button", has_text="Adicionar a permissão storage").first.click(); page.wait_for_timeout(600)
check("correção adiciona a permissão", "storage" in json.loads(doc(page))["permissions"])

# chave do MV2 e arquivo que não existe
m3 = json.loads(doc(page))
m3["browser_action"] = m3.pop("action"); m3["browser_action"]["default_popup"] = "nao-existe.html"
setdoc(page, json.dumps(m3, indent=2, ensure_ascii=False) + "\n"); page.wait_for_timeout(900)
t = panel().inner_text()
check("browser_action do MV2 é erro", "é do Manifest V2" in t)
check("arquivo referenciado inexistente é erro", "“nao-existe.html” não existe" in t)
check("editor marca o problema no manifest.json", page.locator(".cm-lintRange-error").count() >= 1)
panel().locator("button", has_text='Renomear para "action"').first.click(); page.wait_for_timeout(500)
panel().locator("button", has_text="Criar nao-existe.html").first.click(); page.wait_for_timeout(700)
open_file("manifest.json"); json_mode()
m4 = json.loads(doc(page))
pt = panel().inner_text()
check("correções aplicadas: action e arquivo criado", "action" in m4 and "browser_action" not in m4 and "nao-existe.html" in pt and "não existe no projeto" not in pt, pt.replace("\n", " | ")[:1500])
m4["action"]["default_popup"] = "popup.html"
setdoc(page, json.dumps(m4, indent=2, ensure_ascii=False) + "\n"); page.wait_for_timeout(500)

# CSP: script inline e atributo onclick na página do popup
open_file("popup.html")
html = doc(page)
setdoc(page, html.replace("</body>", '  <button onclick="alert(1)">x</button>\n  <script>console.log("inline")</script>\n</body>')); page.wait_for_timeout(1200)
t = panel().inner_text()
check("script inline no popup é erro (CSP do MV3)", "Script inline" in t)
check("onclick no popup é erro (CSP do MV3)", "Atributo onclick" in t)
panel().locator("button", has_text="Mover para um arquivo .js").first.click(); page.wait_for_timeout(700)
open_file("popup.html")
check("correção move o script inline para um arquivo", '<script src="popup-2.js"></script>' in doc(page) and "<script>" not in doc(page), doc(page)[-300:])
open_file("popup-2.js")
check("o código foi para popup-2.js", doc(page).strip() == 'console.log("inline")', doc(page))
open_file("popup.html")
setdoc(page, html); page.wait_for_timeout(500)

# host permission ampla e padrão inválido
open_file("manifest.json"); json_mode()
m5 = json.loads(doc(page)); m5["host_permissions"] = ["<all_urls>", "https://exemplo*.com/*"]
setdoc(page, json.dumps(m5, indent=2, ensure_ascii=False) + "\n"); page.wait_for_timeout(900)
t = panel().inner_text()
check("<all_urls> explica o aviso de instalação", "todos os sites" in t)
check("padrão de URL inválido é erro", "Host inválido" in t)
del m5["host_permissions"]
setdoc(page, json.dumps(m5, indent=2, ensure_ascii=False) + "\n"); page.wait_for_timeout(600)
check("sem problemas depois de arrumar", "Pronta para exportar" in panel().inner_text() or "aviso" in panel().inner_text(), panel().inner_text().replace("\n", " | ")[:1500])

# ---------------------------------------------------------------- 4 preview simulado
panel().locator("button[aria-label='Ver Popup no preview (simulado)']").click(); page.wait_for_timeout(1500)
check("preview marca a simulação", "simulado" in page.locator("[data-pz=ext-sim]").inner_text())
box = page.locator("[data-pz=ext-frame]").bounding_box()
check("popup encolhe para o conteúdo (como no Chrome)", box and 250 <= box["width"] <= 420, box)
user().locator("#contar").click(); user().locator("#contar").click(); page.wait_for_timeout(500)
check("chrome.storage simulado funciona", user().locator("#total").inner_text() == "2")
page.keyboard.press("Control+r"); page.wait_for_timeout(1800)
check("chrome.storage simulado persiste ao recarregar", user().locator("#total").inner_text() == "2")
page.locator("[role=tab]", has_text="Console").click(); page.wait_for_timeout(200)
user().locator("#destacar").click(); page.wait_for_timeout(700)
cons = page.locator("body").inner_text()
check("tabs.sendMessage avisa que content scripts não rodam no preview", "content scripts não rodam no preview" in cons)
check("e o popup recebe o erro real do Chrome", "O content script não roda nesta página." in user().locator("#status").inner_text())
check("chrome.runtime.id é simulado", user().locator("body").evaluate("() => chrome.runtime.id") == "simulado-pelo-poiesis")
user().locator("#opcoes").click(); page.wait_for_timeout(1500)
check("openOptionsPage mostra as opções no preview", user().locator("#salvar").count() == 1)
# permissão removida: chrome.storage some, como no Chrome
open_file("manifest.json"); json_mode()
m6 = json.loads(doc(page)); m6["permissions"] = ["sidePanel"]
setdoc(page, json.dumps(m6, indent=2, ensure_ascii=False) + "\n"); page.wait_for_timeout(1500)
panel().locator("button[aria-label='Ver Popup no preview (simulado)']").click(); page.wait_for_timeout(1500)
check("sem a permissão, chrome.storage fica undefined no preview", user().locator("body").evaluate("() => typeof chrome.storage") == "undefined")
m6["permissions"] = ["sidePanel", "storage"]
setdoc(page, json.dumps(m6, indent=2, ensure_ascii=False) + "\n"); page.wait_for_timeout(600)

# ---------------------------------------------------------------- 5 ícones
show_panel()
panel().locator("button", has_text="Ícones").click(); page.wait_for_timeout(500)
dlg = page.locator("[data-pz=icons-dialog]")
dlg.locator("select[aria-label='Imagem-base do projeto']").select_option("icons/icon-128.png"); page.wait_for_timeout(600)
check("prévia dos 4 tamanhos", dlg.locator("img[alt^='Ícone ']").count() == 4)
dlg.locator("button", has_text="Gerar e usar").click(); page.wait_for_timeout(700)
check("ícones regravados sem erro", "Pronta para exportar" in panel().inner_text() or "aviso" in panel().inner_text())

# ---------------------------------------------------------------- 6 exportar e carregar no Chromium
# um arquivo do Poiesis que não deve ir no ZIP
zpath = export(os.path.join(WORK, "estudio.zip"))
with zipfile.ZipFile(zpath) as z:
    names = z.namelist()
check("ZIP com manifest.json na raiz", "manifest.json" in names, names)
check("ZIP com ícones e páginas", all(n in names for n in ["icons/icon-128.png", "popup.html", "popup.js", "background.js", "content.js", "estilo.css"]), names)
check("ZIP sem nada do runtime do Poiesis", not any("poiesis" in n.lower() for n in names))
with zipfile.ZipFile(zpath) as z:
    zm = json.loads(z.read("manifest.json"))
    png = z.read("icons/icon-48.png")
check("ícone 48 é um PNG 48×48", png[:8] == b"\x89PNG\r\n\x1a\n" and int.from_bytes(png[16:20], "big") == 48 and int.from_bytes(png[20:24], "big") == 48)
check("popup.html exportado sem runtime injetado", "data-poiesis-runtime" not in zipfile.ZipFile(zpath).read("popup.html").decode())

real_dir = unzip(zpath, os.path.join(WORK, "estudio"))
pw = common.PW
prof = os.path.join(WORK, "perfil-real")
shutil.rmtree(prof, ignore_errors=True)
real = pw.chromium.launch_persistent_context(prof, channel="chromium", headless=True, args=[f"--disable-extensions-except={real_dir}", f"--load-extension={real_dir}"])
try:
    sw = real.service_workers[0] if real.service_workers else real.wait_for_event("serviceworker", timeout=15000)
    rid = sw.url.split("/")[2]
    check("Chromium carrega a extensão exportada (service worker ativo)", sw.url.endswith("/background.js"), sw.url)
    check("o ID previsto pelo caminho bate com o do Chromium", rid == ext_id(real_dir), (rid, ext_id(real_dir)))
    pg = real.new_page()
    pg.goto(f"chrome-extension://{rid}/popup.html"); pg.wait_for_timeout(600)
    pg.click("#contar"); pg.click("#contar"); pg.click("#contar"); pg.wait_for_timeout(400)
    check("popup real funciona com chrome.storage de verdade", pg.inner_text("#total") == "3")
    stored = sw.evaluate("() => chrome.storage.local.get('cliques')")
    check("o service worker vê o mesmo armazenamento", stored.get("cliques") == 3, stored)
    real.route("https://example.com/**", lambda r: r.fulfill(status=200, content_type="text/html", body="<!doctype html><title>ok</title><body><p>página</p></body>"))
    site = real.new_page(); site.goto("https://example.com/"); site.wait_for_timeout(1200)
    check("content script roda na página de matches", site.evaluate("document.documentElement.getAttribute('data-poiesis-extensao')") == "ativa")
    errs_real = []
    pg2 = real.new_page(); pg2.on("pageerror", lambda e: errs_real.append(str(e)))
    pg2.goto(f"chrome-extension://{rid}/options.html"); pg2.wait_for_timeout(500)
    pg2.goto(f"chrome-extension://{rid}/sidepanel.html"); pg2.wait_for_timeout(500)
    check("opções e painel lateral abrem sem erro de CSP", not errs_real, errs_real)
finally:
    real.close()

# ---------------------------------------------------------------- 7 principal ↔ complementar
dir_p = os.path.join(WORK, "principal")
dir_c = os.path.join(WORK, "complementar")
id_p, id_c = ext_id(dir_p), ext_id(dir_c)

new_extension("Principal", companion="Principal (recebe)")
t = panel().inner_text()
check("principal começa sem IDs autorizados (aviso claro)", "nenhuma outra extensão" in t.lower() or "externally_connectable" in t)
form = page.locator("[data-pz=manifest-form]")
form.locator("input[aria-label='ID da extensão autorizada']").fill("id-invalido")
check("ID inválido é recusado no formulário", form.locator("button", has_text="Autorizar").is_disabled())
form.locator("input[aria-label='ID da extensão autorizada']").fill(id_c)
form.locator("button", has_text="Autorizar").click(); page.wait_for_timeout(500)
check("ID autorizado gravado em externally_connectable", json.loads(doc(page))["externally_connectable"]["ids"] == [id_c])
zp = export(os.path.join(WORK, "principal.zip"))

new_extension("Complementar", companion="Complementar (envia)")
open_file("config.js")
setdoc(page, doc(page).replace('EXTENSAO_PRINCIPAL = ""', f'EXTENSAO_PRINCIPAL = "{id_p}"')); page.wait_for_timeout(500)
show_panel()
panel().locator("button[aria-label='Ver Popup no preview (simulado)']").click(); page.wait_for_timeout(1500)
user().locator("#falar").click(); page.wait_for_timeout(700)
check("no preview a mensagem externa não é entregue (e o popup mostra o erro real)", "Não foi possível falar com a principal" in user().locator("#status").inner_text())
zc = export(os.path.join(WORK, "complementar.zip"))
unzip(zp, dir_p); unzip(zc, dir_c)

prof2 = os.path.join(WORK, "perfil-duas")
shutil.rmtree(prof2, ignore_errors=True)
both = pw.chromium.launch_persistent_context(prof2, channel="chromium", headless=True, args=[f"--disable-extensions-except={dir_p},{dir_c}", f"--load-extension={dir_p},{dir_c}"])
try:
    for _ in range(50):
        if len(both.service_workers) >= 2: break
        time.sleep(0.3)
    pc = both.new_page()
    pc.goto(f"chrome-extension://{id_c}/popup.html"); pc.wait_for_timeout(800)
    pc.click("#falar"); pc.wait_for_timeout(1200)
    st = pc.inner_text("#status")
    check("complementar conversa com a principal depois da configuração", st == "Resposta: recebido: Olá da complementar!", st)
    pp = both.new_page()
    pp.goto(f"chrome-extension://{id_p}/popup.html"); pp.wait_for_timeout(800)
    check("principal guardou a mensagem com o remetente", id_c in pp.inner_text("#ultima"), pp.inner_text("#ultima"))
finally:
    both.close()

# sem autorização: a principal recusa (o Chrome nem entrega)
shutil.rmtree(dir_c + "-2", ignore_errors=True)
shutil.copytree(dir_c, dir_c + "-2")
id_c2 = ext_id(dir_c + "-2")
prof3 = os.path.join(WORK, "perfil-intrusa")
shutil.rmtree(prof3, ignore_errors=True)
third = pw.chromium.launch_persistent_context(prof3, channel="chromium", headless=True, args=[f"--disable-extensions-except={dir_p},{dir_c}-2", f"--load-extension={dir_p},{dir_c}-2"])
try:
    for _ in range(50):
        if len(third.service_workers) >= 2: break
        time.sleep(0.3)
    pi = third.new_page()
    pi.goto(f"chrome-extension://{id_c2}/popup.html"); pi.wait_for_timeout(800)
    pi.click("#falar"); pi.wait_for_timeout(1200)
    st = pi.inner_text("#status")
    check("extensão não autorizada não consegue falar com a principal", "Resposta:" not in st and st != "", st)
finally:
    third.close()

report(errs, ignore=["addEventListener", "dataset", "reading 'local'", "reading 'sync'"])
