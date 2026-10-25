// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/* Janela de preview destacada: espelha o editor em tempo real via chrome.storage. */
(function () {
  var KEY = "poiesis:popout";
  var frame = document.getElementById("palco");
  var empty = document.getElementById("empty");
  var loaded = false;
  var last = null;

  function show(data) {
    if (!data || !data.html) return;
    last = data;
    document.title = (data.title || "Preview") + " · Poiesis";
    if (!loaded) return;
    empty.style.display = "none";
    frame.contentWindow.postMessage({ __poiesisHost: 1, type: "render", html: data.html }, "*");
  }

  frame.addEventListener("load", function () {
    loaded = true;
    if (last) show(last);
  });

  chrome.storage.local.get(KEY, function (r) {
    show(r && r[KEY]);
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === "local" && changes[KEY]) show(changes[KEY].newValue);
  });

  // mensagens do console da página ficam no DevTools desta aba
  window.addEventListener("message", function () {});
})();
