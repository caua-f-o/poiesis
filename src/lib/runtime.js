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

  /* ---------------- REPL ---------------- */
  W.addEventListener("message", function (e) {
    var d = e.data;
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
