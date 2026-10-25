// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/* Poiesis · palco isolado (página sandbox da extensão).
 * Recebe o HTML montado pelo editor e o renderiza num iframe interno.
 * Usa buffer duplo: o quadro novo carrega escondido e só então substitui o antigo,
 * preservando a rolagem — o preview "respira" em vez de piscar. */
(function () {
  var current = null;
  var pending = null;
  var seq = 0;
  var ALLOW =
    "accelerometer; autoplay; camera; clipboard-read; clipboard-write; display-capture; fullscreen; geolocation; gyroscope; microphone";

  function render(html, hard) {
    var id = ++seq;
    var f = document.createElement("iframe");
    f.setAttribute("allow", ALLOW);
    if (current) f.className = "next";

    var scroll = null;
    if (current && !hard) {
      try {
        var w = current.contentWindow;
        scroll = [w.scrollX, w.scrollY];
      } catch (e) {}
    }

    var done = false;
    function swap() {
      if (done) return;
      done = true;
      if (id !== seq) {
        if (f !== current) f.remove();
        return;
      }
      if (scroll) {
        try {
          f.contentWindow.scrollTo(scroll[0], scroll[1]);
        } catch (e) {}
      }
      var old = current;
      current = f;
      pending = null;
      f.className = "";
      if (old && old !== f) old.remove();
    }

    f.addEventListener("load", swap);
    setTimeout(swap, 1500);
    if (pending && pending !== current) pending.remove();
    pending = f;
    f.srcdoc = html;
    document.body.appendChild(f);
  }

  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || typeof d !== "object") return;
    if (d.__poiesisHost) {
      if (e.source !== window.parent) return;
      if (d.type === "render") render(String(d.html || ""), !!d.hard);
      else if (d.type === "eval" && current) current.contentWindow.postMessage({ __poiesisEval: String(d.code) }, "*");
      else if (d.type === "highlight" && current) current.contentWindow.postMessage({ __poiesisHighlight: String(d.selector) }, "*");
      else if (d.type === "inspect" && current && d.cmd && typeof d.cmd === "object") {
        // repassa só campos simples; o runtime valida de novo
        var c = d.cmd, out = {};
        ["op", "prop", "value", "state", "q"].forEach(function (k) { if (c[k] != null) out[k] = String(c[k]).slice(0, 4000); });
        ["id", "rule"].forEach(function (k) { if (c[k] != null) out[k] = Number(c[k]); });
        ["important", "on", "reselect"].forEach(function (k) { if (c[k] != null) out[k] = !!c[k]; });
        if (c.enabled === true || c.enabled === false) out.enabled = c.enabled;
        if (Array.isArray(c.path)) out.path = c.path.slice(0, 200).map(function (x) { return { tag: String(x && x.tag || "").slice(0, 40), i: Number(x && x.i) || 0 }; });
        current.contentWindow.postMessage({ __poiesisInspect: out }, "*");
      }
      else if (d.type === "net-send" && current && d.req && typeof d.req === "object") {
        // só campos simples atravessam (o runtime valida de novo)
        var q = d.req;
        current.contentWindow.postMessage({ __poiesisNetSend: { method: String(q.method || ""), url: String(q.url || ""), headers: Array.isArray(q.headers) ? q.headers.slice(0, 50).map(function (h) { return [String(h[0]), String(h[1])]; }) : [], body: q.body == null ? null : String(q.body), timeout: Number(q.timeout) || 30000 } }, "*");
      }
      return;
    }
    if (d.__poiesis) {
      var fromCurrent = current && e.source === current.contentWindow;
      var fromPending = pending && e.source === pending.contentWindow;
      if (fromCurrent || fromPending) window.parent.postMessage(d, "*");
    }
  });
})();
