# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 Cauã F. O.
"""Gera as imagens promocionais da Chrome Web Store (440x280 e 1400x560) em store/."""
import base64, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
icon = (ROOT / "design/icon.svg").read_text()
def data_uri(rel):
    return "data:font/woff2;base64," + base64.b64encode((ROOT / rel).read_bytes()).decode()

serif = data_uri("src/assets/fonts/lavishly-yours.woff2")  # fonte dos títulos (OFL)
sans = data_uri("node_modules/@fontsource-variable/roboto-flex/files/roboto-flex-latin-wght-normal.woff2")

def page(w, h, scale):
    return f"""<!doctype html><html><head><style>
@font-face {{ font-family: S; src: url({serif}); }}
@font-face {{ font-family: R; src: url({sans}); font-weight: 100 1000; }}
html,body {{ margin:0; width:{w}px; height:{h}px; overflow:hidden; }}
body {{ background: radial-gradient(120% 140% at 18% 30%, #2a2419 0%, #14120e 45%, #0a0908 100%);
  display:flex; align-items:center; justify-content:center; gap:{36*scale}px; font-family:R; color:#efe9dc; position:relative; }}
body::before {{ content:""; position:absolute; inset:0; opacity:.5;
  background-image: radial-gradient(#e2bb72 0.8px, transparent 1.2px); background-size: {22*scale}px {22*scale}px;
  -webkit-mask-image: radial-gradient(60% 80% at 80% 50%, #000, transparent); }}
.i svg {{ width:{120*scale}px; height:{120*scale}px; display:block; filter: drop-shadow(0 {10*scale}px {30*scale}px rgba(0,0,0,.55)); }}
.t {{ position:relative; }}
h1 {{ margin:0; padding:0 {14*scale}px {8*scale}px 0; font:400 {92*scale}px/1 S;
  background: linear-gradient(180deg, #ffe3a0 0%, #f6c461 55%, #d8952f 100%); -webkit-background-clip:text; background-clip:text; color:transparent;
  filter: drop-shadow(0 0 {14*scale}px rgba(246,196,97,.35)); }}
p {{ margin:{6*scale}px 0 0; font-size:{17*scale}px; letter-spacing:.06em; color:#f3ead6; font-weight:400; }}
</style></head><body><div class="i">{icon}</div><div class="t"><h1>Poiesis</h1><p>Onde seu código ganha vida</p></div></body></html>"""

with sync_playwright() as p:
    b = p.chromium.launch()
    for w, h, scale, name in [(440, 280, 1, "promo-pequena-440x280.png"), (1400, 560, 2.3, "promo-marquee-1400x560.png")]:
        pg = b.new_page(viewport={"width": w, "height": h})
        pg.set_content(page(w, h, scale)); pg.evaluate("document.fonts.ready"); pg.wait_for_timeout(400)
        pg.screenshot(path=str(ROOT / "store" / name))
    b.close()
