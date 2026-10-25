(function (CFG) {
  "use strict";
  var W = window;
  var parentWin = W.parent;
  var origin = "*";
  var files = CFG.files || {};
  var dir = CFG.dir || "";

  /* ---------------- caminhos ---------------- */
  function resolve(ref, from) {
    if (typeof ref !== "string") return null;
    var clean = ref.trim().split(/[?#]/)[0];
    if (!clean || /^[a-z][a-z0-9+.-]*:/i.test(clean) || clean.indexOf("//") === 0) return null;
    var base = clean.charAt(0) === "/" ? "" : from == null ? dir : from;
    var parts = ((base ? base + "/" : "") + clean.replace(/^\//, "")).split("/");
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p || p === ".") continue;
      if (p === "..") out.pop();
      else out.push(p);
    }
    try { return decodeURIComponent(out.join("/")); } catch (e) { return out.join("/"); }
  }

  /* ---------------- módulos ES (import entre arquivos do projeto) ---------------- */
  if (CFG.modules) {
    var imports = {};
    for (var k in CFG.modules) {
      var blob = new Blob([CFG.modules[k]], { type: "text/javascript" });
      imports["@poiesis/" + k] = URL.createObjectURL(blob);
    }
    var map = document.createElement("script");
    map.type = "importmap";
    map.textContent = JSON.stringify({ imports: imports });
    var cs = document.currentScript;
    if (cs && cs.parentNode) cs.parentNode.insertBefore(map, cs.nextSibling);
    else document.head.appendChild(map);
  }

  /* ---------------- fetch para arquivos do projeto ---------------- */
  var nativeFetch = W.fetch ? W.fetch.bind(W) : null;
  if (nativeFetch) {
    W.fetch = function (input, init) {
      var url = typeof input === "string" ? input : input && input.url;
      var path = resolve(url);
      if (path != null) {
        var f = files[path] || files[path.toLowerCase()];
        if (f) {
          if (f.d) return nativeFetch(f.d, init);
          return Promise.resolve(new Response(f.t, { status: 200, headers: { "Content-Type": f.m } }));
        }
      }
      return nativeFetch(input, init);
    };
  }

  /* ---------------- localStorage/sessionStorage/cookie na sandbox ----------------
   * O preview roda numa origem isolada, onde o navegador bloqueia o armazenamento.
   * Este substituto se comporta como o Storage real e o editor guarda os dados por projeto. */
  function makeStorage(initial, persist) {
    var data = {};
    for (var k0 in initial || {}) data[k0] = String(initial[k0]);
    function sync() {
      if (!persist) return;
      try { parentWin.postMessage({ __poiesis: 1, type: "storage", data: data }, origin); } catch (e) {}
    }
    var api = {
      getItem: function (k) { k = String(k); return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[String(k)] = String(v); sync(); },
      removeItem: function (k) { delete data[String(k)]; sync(); },
      clear: function () { data = {}; sync(); },
      key: function (i) { var ks = Object.keys(data); return i < ks.length ? ks[i] : null; },
    };
    return new Proxy(api, {
      get: function (t, p) {
        if (p === "length") return Object.keys(data).length;
        if (p in t) return t[p];
        if (typeof p === "string" && Object.prototype.hasOwnProperty.call(data, p)) return data[p];
        return undefined;
      },
      set: function (t, p, v) { if (p in t) return false; data[String(p)] = String(v); sync(); return true; },
      deleteProperty: function (t, p) { delete data[String(p)]; sync(); return true; },
      has: function (t, p) { return p in t || Object.prototype.hasOwnProperty.call(data, p); },
      ownKeys: function () { return Object.keys(data); },
      getOwnPropertyDescriptor: function (t, p) {
        if (Object.prototype.hasOwnProperty.call(data, p)) return { value: data[p], writable: true, enumerable: true, configurable: true };
        return undefined;
      },
    });
  }
  function blocked(name) {
    try { void W[name]; return false; } catch (e) { return true; }
  }
  if (blocked("localStorage")) {
    try { Object.defineProperty(W, "localStorage", { value: makeStorage(CFG.storage, true), configurable: true }); } catch (e) {}
  }
  if (blocked("sessionStorage")) {
    try { Object.defineProperty(W, "sessionStorage", { value: makeStorage({}, false), configurable: true }); } catch (e) {}
  }
  try { void document.cookie; } catch (e) {
    var jar = {};
    try {
      Object.defineProperty(document, "cookie", {
        configurable: true,
        get: function () { return Object.keys(jar).map(function (k) { return k + "=" + jar[k]; }).join("; "); },
        set: function (v) { var kv = String(v).split(";")[0]; var i = kv.indexOf("="); if (i > 0) jar[kv.slice(0, i).trim()] = kv.slice(i + 1).trim(); },
      });
    } catch (e2) {}
  }

  if (!CFG.console) return;

  /* ---------------- serialização para o console ---------------- */
  function ctorName(v) {
    try {
      var p = Object.getPrototypeOf(v);
      if (p === null) return "Object";
      return (p.constructor && p.constructor.name) || "Object";
    } catch (e) { return "Object"; }
  }
  function describeEl(el) {
    var s = "<" + el.tagName.toLowerCase();
    if (el.id) s += ' id="' + el.id + '"';
    if (el.className && typeof el.className === "string" && el.className.trim()) s += ' class="' + el.className.trim() + '"';
    s += ">";
    var txt = (el.textContent || "").trim().replace(/\s+/g, " ");
    if (txt && el.children.length === 0) s += txt.length > 40 ? txt.slice(0, 40) + "…" : txt;
    else if (el.children.length) s += "…";
    return s + "</" + el.tagName.toLowerCase() + ">";
  }
  function ser(v, d, seen) {
    d = d || 0;
    seen = seen || [];
    var t = typeof v;
    if (v === null) return { t: "null" };
    if (t === "undefined") return { t: "undef" };
    if (t === "string") return { t: "str", v: v.length > 20000 ? v.slice(0, 20000) + "…" : v };
    if (t === "number") return { t: "num", v: Object.is(v, -0) ? "-0" : String(v) };
    if (t === "bigint") return { t: "num", v: String(v) + "n" };
    if (t === "boolean") return { t: "bool", v: v };
    if (t === "symbol") return { t: "sym", v: String(v) };
    if (t === "function") {
      var src = "";
      try { src = Function.prototype.toString.call(v); } catch (e) {}
      return { t: "fn", v: v.name || "anônima", s: src.slice(0, 300) };
    }
    try {
      if (v instanceof Error) return { t: "err", n: v.name || "Error", v: String(v.message), s: String(v.stack || "") };
      if (typeof Element !== "undefined" && v instanceof Element) return { t: "el", v: describeEl(v) };
      if (v instanceof Date) return { t: "date", v: isNaN(v) ? "Invalid Date" : v.toISOString() };
      if (v instanceof RegExp) return { t: "re", v: String(v) };
    } catch (e) {}
    if (seen.indexOf(v) !== -1) return { t: "circ" };
    var c = ctorName(v);
    if (d > 3) return { t: "more", v: Array.isArray(v) ? "Array(" + v.length + ")" : c };
    seen = seen.concat([v]);
    var i, out;
    try {
      if (Array.isArray(v) || (ArrayBuffer.isView && ArrayBuffer.isView(v) && !(v instanceof DataView))) {
        out = [];
        for (i = 0; i < Math.min(v.length, 100); i++) out.push(ser(v[i], d + 1, seen));
        return { t: "arr", c: c, n: v.length, e: out };
      }
      if (v instanceof Map) {
        out = [];
        i = 0;
        v.forEach(function (val, key) { if (i++ < 100) out.push([ser(key, d + 1, seen), ser(val, d + 1, seen)]); });
        return { t: "map", c: "Map", n: v.size, e: out };
      }
      if (v instanceof Set) {
        out = [];
        v.forEach(function (val) { if (out.length < 100) out.push(ser(val, d + 1, seen)); });
        return { t: "arr", c: "Set", n: v.size, e: out };
      }
      if (typeof NodeList !== "undefined" && (v instanceof NodeList || v instanceof HTMLCollection)) {
        out = [];
        for (i = 0; i < Math.min(v.length, 100); i++) out.push(ser(v[i], d + 1, seen));
        return { t: "arr", c: c, n: v.length, e: out };
      }
      if (typeof Promise !== "undefined" && v instanceof Promise) return { t: "obj", c: "Promise", e: [] };
    } catch (e) {}
    var keys = [];
    try { keys = Object.keys(v); } catch (e) {}
    out = [];
    for (i = 0; i < Math.min(keys.length, 100); i++) {
      var val;
      try { val = v[keys[i]]; } catch (e) { val = "<erro ao ler>"; }
      out.push([keys[i], ser(val, d + 1, seen)]);
    }
    return { t: "obj", c: c, e: out, x: keys.length > 100 };
  }

  function srcFromStack(stack) {
    if (!stack) return null;
    var lines = String(stack).split("\n");
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (l.indexOf("poiesis-runtime") !== -1) continue;
      var m = /\(?([^\s()]+?):(\d+):(\d+)\)?\s*$/.exec(l);
      if (m && m[1].indexOf("about:srcdoc") === -1 && !/^(chrome-extension|blob|https?):/.test(m[1])) {
        return { file: m[1], line: +m[2], col: +m[3] };
      }
    }
    return null;
  }

  function post(level, args, src) {
    try {
      parentWin.postMessage({ __poiesis: 1, type: "log", level: level, args: args, src: src || null }, origin);
    } catch (e) {}
  }

  var C = W.console;
  var orig = {};
  ["log", "info", "warn", "error", "debug", "dir", "table", "trace", "assert", "clear", "count", "countReset", "time", "timeEnd", "timeLog"].forEach(function (m) {
    orig[m] = C[m] ? C[m].bind(C) : function () {};
  });
  function here() {
    try { throw new Error(); } catch (e) { return srcFromStack(e.stack); }
  }
  function wrap(method, level) {
    C[method] = function () {
      var a = Array.prototype.slice.call(arguments);
      orig[method].apply(null, a);
      post(level, a.map(function (x) { return ser(x); }), here());
    };
  }
  wrap("log", "log");
  wrap("info", "info");
  wrap("warn", "warn");
  wrap("error", "error");
  wrap("debug", "debug");
  wrap("dir", "log");
  wrap("table", "log");
  C.trace = function () {
    var a = Array.prototype.slice.call(arguments);
    orig.trace.apply(null, a);
    var st = "";
    try { throw new Error(); } catch (e) { st = String(e.stack).split("\n").slice(2).join("\n"); }
    a.push("\n" + st);
    post("log", a.map(function (x) { return ser(x); }), here());
  };
  C.assert = function (cond) {
    orig.assert.apply(null, arguments);
    if (!cond) {
      var a = Array.prototype.slice.call(arguments, 1);
      a.unshift("Asserção falhou:");
      post("error", a.map(function (x) { return ser(x); }), here());
    }
  };
  C.clear = function () {
    orig.clear();
    try { parentWin.postMessage({ __poiesis: 1, type: "clear" }, origin); } catch (e) {}
  };
  var counts = {};
  C.count = function (label) {
    label = label === undefined ? "default" : String(label);
    counts[label] = (counts[label] || 0) + 1;
    post("log", [ser(label + ": " + counts[label])], here());
  };
  C.countReset = function (label) { counts[label === undefined ? "default" : String(label)] = 0; };
  var timers = {};
  C.time = function (label) { timers[label === undefined ? "default" : String(label)] = performance.now(); };
  C.timeLog = C.timeEnd = function (label) {
    label = label === undefined ? "default" : String(label);
    if (timers[label] == null) return;
    post("log", [ser(label + ": " + (performance.now() - timers[label]).toFixed(2) + " ms")], here());
  };

  W.addEventListener("error", function (e) {
    if (e.target && e.target !== W && e.target.tagName) {
      var el = e.target;
      post("error", [ser("Falha ao carregar recurso: " + (el.src || el.href || el.tagName.toLowerCase()))], null);
      return;
    }
    var err = e.error;
    var src = (err && srcFromStack(err.stack)) || null;
    if (err && typeof err === "object") post("error", [ser(err)], src);
    else post("error", [ser(String(e.message || "Erro"))], src);
  }, true);

  W.addEventListener("unhandledrejection", function (e) {
    var r = e.reason;
    post("error", [ser("Promise rejeitada sem tratamento:"), ser(r)], r && r.stack ? srcFromStack(r.stack) : null);
  });

  /* ---------------- realce de elementos ("Ver no preview") ---------------- */
  function highlight(selector) {
    var els;
    try { els = document.querySelectorAll(selector); } catch (err) { return 0; }
    var boxes = [];
    for (var i = 0; i < els.length && i < 200; i++) {
      var r = els[i].getBoundingClientRect();
      var b = document.createElement("div");
      b.setAttribute("data-poiesis-hl", "");
      b.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;border-radius:4px;" +
        "outline:2px solid #d9b26f;background:rgba(217,178,111,.18);transition:opacity .5s;" +
        "left:" + r.left + "px;top:" + r.top + "px;width:" + r.width + "px;height:" + r.height + "px";
      document.documentElement.appendChild(b);
      boxes.push(b);
    }
    if (els[0] && els[0].scrollIntoView) {
      var rr = els[0].getBoundingClientRect();
      if (rr.top < 0 || rr.bottom > innerHeight) els[0].scrollIntoView({ block: "center", behavior: "smooth" });
    }
    setTimeout(function () { boxes.forEach(function (b) { b.style.opacity = "0"; }); }, 1400);
    setTimeout(function () { boxes.forEach(function (b) { b.remove(); }); }, 2000);
    return els.length;
  }

  /* ---------------- REPL ---------------- */
  W.addEventListener("message", function (e) {
    // comandos (REPL e destaque) só valem quando vêm do sandbox que hospeda a página;
    // iframes de terceiros embutidos na página não podem executar código nela
    if (e.source !== parentWin) return;
    var d = e.data;
    if (d && d.__poiesisHighlight != null) {
      var n = highlight(String(d.__poiesisHighlight));
      post("system", [ser(n ? n + " elemento(s) com " + d.__poiesisHighlight : "Nenhum elemento com " + d.__poiesisHighlight + " nesta página")]);
      return;
    }
    if (!d || d.__poiesisEval == null) return;
    try {
      var res = (0, eval)(String(d.__poiesisEval));
      if (res && typeof res.then === "function") {
        res.then(function (v) { post("result", [ser(v)]); }, function (err) { post("error", [ser(err)]); });
      } else {
        post("result", [ser(res)]);
      }
    } catch (err) {
      post("error", [ser(err)]);
    }
  });

  /* ---------------- navegação entre páginas do projeto ---------------- */
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (!href || href.charAt(0) === "#" || /^javascript:/i.test(href) || a.hasAttribute("download")) return;
    e.preventDefault();
    if (/^(https?:)?\/\//i.test(href) || /^mailto:/i.test(href)) {
      parentWin.postMessage({ __poiesis: 1, type: "open", href: a.href }, origin);
    } else {
      parentWin.postMessage({ __poiesis: 1, type: "navigate", path: resolve(href), hash: href.split("#")[1] || "" }, origin);
    }
  });

  W.addEventListener("load", function () {
    parentWin.postMessage({ __poiesis: 1, type: "ready", ms: Math.round(performance.now()) }, origin);
  });
})(/*__CFG__*/);
//# sourceURL=poiesis-runtime.js
