# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 Cauã F. O.
import sys, asyncio
from playwright.sync_api import sync_playwright
src_big = open('icon.svg').read()
src_small = open('icon-small.svg').read()
src_store = open('icon-store.svg').read()  # 128: arte 96x96 + 16 px de margem (exigência da Web Store)
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(device_scale_factor=1)
    for size, src in [(16, src_small), (32, src_small), (48, src_big), (128, src_store), (512, src_big)]:
        pg.set_viewport_size({"width": size, "height": size})
        pg.set_content(f'<html><body style="margin:0;background:transparent">{src.replace("width=\"128\" height=\"128\"", f"width=\"{size}\" height=\"{size}\"", 1)}</body></html>')
        pg.screenshot(path=f'../public/icons/icon-{size}.png', omit_background=True, clip={"x":0,"y":0,"width":size,"height":size})
    b.close()
