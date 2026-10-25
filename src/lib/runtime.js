(function (CFG) {
  "use strict";
  var W = window;
  var parentWin = W.parent;
  var origin = "*";
  var SESSION = CFG.session || "";
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

  /* ---------------- rede: fetch/XHR instrumentados, arquivos do projeto e mocks ----------------
   * Tudo roda dentro da página isolada (sandbox). O registro vai para o editor, que valida
   * cada campo; aqui só limitamos tamanhos e nunca executamos nada vindo dos mocks. */
  var NET = CFG.net || { mocks: [] };
  var MAX_BODY = 256 * 1024;
  var netSeq = 0;
  var NETP = Math.random().toString(36).slice(2, 7); // ids únicos entre recarregamentos
  var consoleTag = null;
  var nativeFetch = W.fetch ? W.fetch.bind(W) : null;
  var NativeXHR = W.XMLHttpRequest;
  var T0 = (performance.timeOrigin || Date.now() - performance.now());

  function netPost(e) {
    try { parentWin.postMessage({ __poiesis: 1, v: 1, s: SESSION, type: "net", e: e }, origin); } catch (err) {}
  }
  // URLs relativas são do projeto: mostradas sob uma origem fictícia estável (o documento
  // do preview herda a base da página sandbox, que não diz nada ao usuário)
  var PROJ = "https://projeto.poiesis/";
  function absUrl(u) {
    var s = String(u);
    try { return /^[a-z][a-z0-9+.-]*:|^\/\//i.test(s) ? new URL(s).href : new URL(s, PROJ + dir + (dir ? "/" : "")).href; } catch (e) { return s; }
  }
  function displayUrl(raw) {
    // caminhos do projeto aparecem como /caminho; o resto, absoluto
    var p = resolve(String(raw));
    return p != null ? "/" + p : absUrl(raw);
  }
  function caller() {
    var src = srcFromStack(new Error().stack);
    return src ? src.file + ":" + src.line : "";
  }
  function headerPairs(h) {
    var out = [];
    try {
      if (!h) return out;
      if (typeof h.forEach === "function" && !Array.isArray(h)) h.forEach(function (v, k) { out.push([String(k), String(v)]); });
      else if (Array.isArray(h)) h.forEach(function (kv) { out.push([String(kv[0]), String(kv[1])]); });
      else for (var k in h) if (Object.prototype.hasOwnProperty.call(h, k)) out.push([k, String(h[k])]);
    } catch (e) {}
    return out.slice(0, 100);
  }
  function textBody(v, mime) {
    var t = String(v);
    return { t: "text", v: t.length > MAX_BODY ? t.slice(0, MAX_BODY) : t, size: t.length, truncated: t.length > MAX_BODY || undefined, mime: mime };
  }
  function reqBody(b) {
    if (b == null) return { t: "none", size: 0 };
    if (typeof b === "string") return textBody(b);
    if (b instanceof URLSearchParams) return { t: "form", v: b.toString().slice(0, MAX_BODY), size: b.toString().length };
    if (typeof FormData !== "undefined" && b instanceof FormData) {
      var parts = [];
      b.forEach(function (v, k) { parts.push(k + "=" + (typeof v === "string" ? v : "[arquivo " + (v.name || "") + ", " + v.size + " bytes]")); });
      var j = parts.join("&");
      return { t: "form", v: j.slice(0, MAX_BODY), size: j.length };
    }
    if (typeof Blob !== "undefined" && b instanceof Blob) return { t: "binary", size: b.size, mime: b.type };
    if (b instanceof ArrayBuffer || ArrayBuffer.isView(b)) return { t: "binary", size: b.byteLength };
    if (typeof ReadableStream !== "undefined" && b instanceof ReadableStream) return { t: "stream", size: 0 };
    return textBody(b);
  }
  var TEXTY = /(^text\/|json|javascript|xml|html|css|x-www-form-urlencoded|svg|csv|markdown)/i;
  function resBodyOf(res) {
    var mime = (res.headers && res.headers.get("content-type")) || "";
    if (res.type === "opaque") return Promise.resolve({ t: "opaque", size: 0 });
    if (/event-stream/i.test(mime)) return Promise.resolve({ t: "stream", size: 0, mime: mime });
    var len = Number(res.headers && res.headers.get("content-length")) || 0;
    if (!TEXTY.test(mime) && mime) return Promise.resolve({ t: "binary", size: len, mime: mime });
    if (len > 4 * MAX_BODY) return Promise.resolve({ t: "text", size: len, truncated: true, mime: mime });
    return res.clone().text().then(function (t) { return textBody(t, mime); }, function () { return { t: "binary", size: len, mime: mime }; });
  }

  /* --- mocks: padrões simples (* e **), sem expressões regulares do usuário --- */
  function globRe(p) {
    var out = "";
    for (var i = 0; i < p.length; i++) {
      var c = p.charAt(i);
      if (c === "*") {
        if (p.charAt(i + 1) === "*") { out += ".*"; i++; } else out += "[^/]*";
      } else out += c.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }
    return new RegExp("^" + out + "$");
  }
  var mocks = (NET.mocks || []).map(function (m) {
    var abs = /^[a-z][a-z0-9+.-]*:\/\//i.test(m.url);
    var pat = abs ? m.url : "/" + m.url.replace(/^\.?\//, "");
    try { return { m: m, abs: abs, query: pat.indexOf("?") >= 0, re: globRe(pat) }; } catch (e) { return null; }
  }).filter(Boolean);
  function findMock(method, rawUrl) {
    if (!mocks.length) return null;
    var full = absUrl(rawUrl).split("#")[0];
    var path = resolve(String(rawUrl));
    for (var i = 0; i < mocks.length; i++) {
      var x = mocks[i];
      if (x.m.method !== "*" && x.m.method !== method) continue;
      var target;
      if (x.abs) target = x.query ? full : full.split("?")[0];
      else {
        if (path == null && full.indexOf("https://projeto.poiesis/") !== 0) {
          // URL absoluta de outro host: compara o caminho dela
          try { var u = new URL(full); target = u.pathname + (x.query ? u.search : ""); } catch (e) { continue; }
        } else {
          target = "/" + (path != null ? path : full.replace("https://projeto.poiesis/", "").split("?")[0]);
          if (x.query) { var q = String(rawUrl).split("?")[1]; if (q) target += "?" + q.split("#")[0]; }
        }
      }
      if (x.re.test(target)) return x.m;
    }
    return null;
  }
  function mockPayload(m) {
    var headers = {};
    for (var k in m.headers) headers[k] = m.headers[k];
    var text = "";
    if (m.bodyFile) {
      var bf = files[m.bodyFile] || files[String(m.bodyFile).toLowerCase()];
      if (bf) { text = bf.t != null ? bf.t : ""; if (!hasHeader(headers, "content-type")) headers["Content-Type"] = bf.m; }
    } else if (m.body !== undefined) {
      text = typeof m.body === "string" ? m.body : JSON.stringify(m.body);
      if (!hasHeader(headers, "content-type")) headers["Content-Type"] = typeof m.body === "string" ? "text/plain; charset=utf-8" : "application/json";
    }
    return { text: text, headers: headers };
  }
  function hasHeader(h, name) { for (var k in h) if (k.toLowerCase() === name) return true; return false; }
  function wait(ms, signal) {
    return new Promise(function (res, rej) {
      if (signal && signal.aborted) return rej(new DOMException("A requisição foi cancelada.", "AbortError"));
      var t = setTimeout(res, ms);
      if (signal) signal.addEventListener("abort", function () { clearTimeout(t); rej(new DOMException("A requisição foi cancelada.", "AbortError")); }, { once: true });
    });
  }
  function classify(err, url) {
    var n = err && err.name;
    if (n === "AbortError") return { kind: "abort", message: String(err.message || "cancelada") };
    if (n === "TimeoutError") return { kind: "timeout", message: String(err.message || "tempo esgotado") };
    if (navigator.onLine === false) return { kind: "offline", message: String(err && err.message || "offline") };
    var cross = false;
    try { cross = new URL(absUrl(url)).origin !== "https://projeto.poiesis"; } catch (e) {}
    return { kind: cross && n === "TypeError" ? "cors" : "network", message: String(err && err.message || err) };
  }

  if (nativeFetch) {
    W.fetch = function (input, init) {
      init = init || {};
      var isReq = typeof Request !== "undefined" && input instanceof Request;
      var rawUrl = isReq ? input.url : String(input && input.href != null ? input.href : input);
      var method = String(init.method || (isReq ? input.method : "GET")).toUpperCase();
      var id = NETP + "-f" + (++netSeq);
      var t0 = performance.now();
      var entry = {
        id: id, kind: "fetch", method: method, url: displayUrl(rawUrl), source: "network", start: T0 + t0,
        reqHeaders: headerPairs(init.headers || (isReq ? input.headers : null)), resHeaders: [], reqBody: reqBody(init.body),
        initiator: caller(), fromConsole: consoleTag ? true : undefined,
      };
      consoleTag = null;
      var signal = init.signal || (isReq ? input.signal : undefined);
      function finish(res, source, extra) {
        entry.duration = performance.now() - t0;
        entry.source = source;
        entry.status = res.status;
        entry.statusText = res.statusText;
        entry.resHeaders = headerPairs(res.headers);
        if (extra) for (var k in extra) entry[k] = extra[k];
        resBodyOf(res).then(function (b) { entry.resBody = b; netPost(entry); });
        return res;
      }
      function fail(err, source, extra) {
        entry.duration = performance.now() - t0;
        entry.source = source;
        entry.error = (extra && extra.error) || classify(err, rawUrl);
        if (extra && extra.mockId) entry.mockId = extra.mockId;
        netPost(entry);
        throw err;
      }
      netPost(entry);

      var mock = findMock(method, rawUrl);
      if (mock) {
        var delay = Math.max(0, Math.min(30000, mock.delay || 0));
        if (mock.error === "network")
          return wait(delay, signal).then(function () { return fail(new TypeError("Failed to fetch (simulado)"), "mock", { mockId: mock.id, error: { kind: "mock", message: "Falha de rede simulada" } }); }, function (e) { return fail(e, "mock", { mockId: mock.id }); });
        if (mock.error === "timeout")
          return wait(delay || 10000, signal).then(function () { return fail(new DOMException("Tempo esgotado (simulado).", "TimeoutError"), "mock", { mockId: mock.id, error: { kind: "timeout", message: "Timeout simulado por mock" } }); }, function (e) { return fail(e, "mock", { mockId: mock.id }); });
        var pl = mockPayload(mock);
        return wait(delay, signal).then(function () {
          var res = new Response(mock.status === 204 || mock.status === 304 ? null : pl.text, { status: mock.status, headers: pl.headers });
          try { Object.defineProperty(res, "url", { value: absUrl(rawUrl) }); } catch (e) {}
          return finish(res, "mock", { mockId: mock.id });
        }, function (e) { return fail(e, "mock", { mockId: mock.id }); });
      }

      var path = resolve(rawUrl);
      if (path != null) {
        var f = files[path] || files[path.toLowerCase()];
        if (f) {
          if (f.d) return nativeFetch(f.d, init).then(function (r) { return finish(r, "project"); }, function (e) { return fail(e, "project"); });
          return Promise.resolve(finish(new Response(f.t, { status: 200, headers: { "Content-Type": f.m } }), "project"));
        }
      }
      return nativeFetch(input, init).then(function (r) { return finish(r, "network"); }, function (e) { return fail(e, "network"); });
    };
  }

  /* --- XMLHttpRequest: registra, e responde arquivos do projeto e mocks sem rede --- */
  if (NativeXHR) {
    var XP = NativeXHR.prototype;
    var oOpen = XP.open, oSend = XP.send, oSetH = XP.setRequestHeader, oAbort = XP.abort;
    function fake(xhr, props) {
      for (var k in props) { try { Object.defineProperty(xhr, k, { value: props[k], configurable: true }); } catch (e) {} }
    }
    function fire(xhr, type) {
      var ev = /^(load|loadend|error|timeout|abort|progress|loadstart)$/.test(type) ? new ProgressEvent(type) : new Event(type);
      xhr.dispatchEvent(ev);
    }
    XP.open = function (method, url) {
      this.__pz = { method: String(method || "GET").toUpperCase(), raw: String(url), headers: [] };
      return oOpen.apply(this, arguments);
    };
    XP.setRequestHeader = function (k, v) {
      if (this.__pz && this.__pz.headers.length < 100) this.__pz.headers.push([String(k), String(v)]);
      return oSetH.apply(this, arguments);
    };
    XP.send = function (body) {
      var xhr = this, z = xhr.__pz;
      if (!z) return oSend.apply(xhr, arguments);
      var t0 = performance.now();
      var entry = { id: NETP + "-x" + (++netSeq), kind: "xhr", method: z.method, url: displayUrl(z.raw), source: "network", start: T0 + t0,
        reqHeaders: z.headers.slice(), resHeaders: [], reqBody: reqBody(body), initiator: caller() };
      netPost(entry);
      function done(source, extra) {
        entry.duration = performance.now() - t0;
        entry.source = source;
        if (extra) for (var k in extra) entry[k] = extra[k];
        netPost(entry);
      }
      var mock = findMock(z.method, z.raw);
      var path = resolve(z.raw);
      var pf = path != null ? (files[path] || files[path.toLowerCase()]) : null;
      if (mock || (pf && pf.t != null)) {
        // resposta local: simula o ciclo de eventos do XHR sem tocar na rede
        var status = mock ? mock.status : 200, text, headers;
        if (mock) { var pl = mockPayload(mock); text = pl.text; headers = pl.headers; } else { text = pf.t; headers = { "Content-Type": pf.m }; }
        var delay = mock ? Math.max(0, Math.min(30000, mock.delay || (mock.error === "timeout" ? 10000 : 0))) : 0;
        var hdrText = Object.keys(headers).map(function (k) { return k.toLowerCase() + ": " + headers[k]; }).join("\r\n");
        z.timer = setTimeout(function () {
          if (mock && mock.error) {
            fake(xhr, { readyState: 4, status: 0, statusText: "", responseText: "", response: "" });
            fire(xhr, "readystatechange");
            var type = mock.error === "timeout" && xhr.timeout ? "timeout" : "error";
            fire(xhr, type); fire(xhr, "loadend");
            done("mock", { mockId: mock.id, error: { kind: mock.error === "timeout" ? "timeout" : "mock", message: mock.error === "timeout" ? "Timeout simulado por mock" : "Falha de rede simulada" } });
            return;
          }
          var rt = xhr.responseType || "";
          var resp = text;
          if (rt === "json") { try { resp = JSON.parse(text); } catch (e) { resp = null; } }
          fake(xhr, {
            readyState: 4, status: status, statusText: status === 200 ? "OK" : "", responseURL: absUrl(z.raw),
            responseText: rt === "" || rt === "text" ? text : "", response: resp,
            getAllResponseHeaders: function () { return hdrText; },
            getResponseHeader: function (n) { for (var k in headers) if (k.toLowerCase() === String(n).toLowerCase()) return headers[k]; return null; },
          });
          fire(xhr, "readystatechange"); fire(xhr, "load"); fire(xhr, "loadend");
          entry.status = status;
          entry.resHeaders = headerPairs(headers);
          entry.resBody = textBody(text, headers["Content-Type"] || headers["content-type"]);
          done(mock ? "mock" : "project", mock ? { mockId: mock.id } : null);
        }, delay);
        z.local = true;
        return;
      }
      xhr.addEventListener("loadend", function () {
        if (xhr.status === 0) {
          done("network", { error: classify({ name: z.timedOut ? "TimeoutError" : z.aborted ? "AbortError" : "TypeError", message: z.timedOut ? "tempo esgotado" : z.aborted ? "cancelada" : "Falha de rede" }, z.raw) });
          return;
        }
        entry.status = xhr.status;
        entry.statusText = xhr.statusText;
        entry.resHeaders = (xhr.getAllResponseHeaders() || "").trim().split(/\r?\n/).filter(Boolean).slice(0, 100).map(function (l) { var i = l.indexOf(":"); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; });
        var mime = xhr.getResponseHeader("content-type") || "";
        var rt = xhr.responseType || "";
        if ((rt === "" || rt === "text") && TEXTY.test(mime || "text/plain")) entry.resBody = textBody(xhr.responseText, mime);
        else if (rt === "json") entry.resBody = textBody(JSON.stringify(xhr.response), mime);
        else entry.resBody = { t: "binary", size: Number(xhr.getResponseHeader("content-length")) || 0, mime: mime };
        done("network");
      });
      xhr.addEventListener("timeout", function () { z.timedOut = true; });
      xhr.addEventListener("abort", function () { z.aborted = true; });
      return oSend.apply(xhr, arguments);
    };
    XP.abort = function () {
      var z = this.__pz;
      if (z && z.local && z.timer) {
        clearTimeout(z.timer);
        fake(this, { readyState: 4, status: 0 });
        fire(this, "abort"); fire(this, "loadend");
        return;
      }
      return oAbort.apply(this, arguments);
    };
  }

  /* --- sendBeacon e recursos carregados por tags (só URL, tipo e tempo) --- */
  if (navigator.sendBeacon) {
    var oBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      var ok = oBeacon(url, data);
      netPost({ id: NETP + "-b" + (++netSeq), kind: "beacon", method: "POST", url: displayUrl(url), source: "network", start: Date.now(), duration: 0,
        reqHeaders: [], resHeaders: [], reqBody: reqBody(data), initiator: caller(), status: ok ? 0 : undefined, partial: true, initiatorType: "beacon" });
      return ok;
    };
  }
  if (W.WebSocket) {
    var NWS = W.WebSocket;
    W.WebSocket = function (url, protocols) {
      var ws = protocols !== undefined ? new NWS(url, protocols) : new NWS(url);
      netPost({ id: NETP + "-w" + (++netSeq), kind: "ws", method: "GET", url: absUrl(url), source: "network", start: Date.now(), reqHeaders: [], resHeaders: [],
        reqBody: { t: "none", size: 0 }, partial: true, initiatorType: "websocket", initiator: caller() });
      return ws;
    };
    W.WebSocket.prototype = NWS.prototype;
    ["CONNECTING", "OPEN", "CLOSING", "CLOSED"].forEach(function (k) { W.WebSocket[k] = NWS[k]; });
  }
  try {
    new PerformanceObserver(function (list) {
      list.getEntries().forEach(function (r) {
        if (r.initiatorType === "fetch" || r.initiatorType === "xmlhttprequest" || r.initiatorType === "beacon") return;
        if (/^(data|blob):/.test(r.name)) return;
        netPost({ id: NETP + "-r" + (++netSeq), kind: "resource", method: "GET", url: r.name, source: "network", start: T0 + r.startTime, duration: r.duration,
          status: r.responseStatus || undefined, reqHeaders: [], resHeaders: [], reqBody: { t: "none", size: 0 },
          resBody: { t: "binary", size: r.transferSize || r.encodedBodySize || 0 }, partial: true, initiatorType: r.initiatorType });
      });
    }).observe({ type: "resource", buffered: true });
  } catch (e) {}

  /* --- console de APIs: o editor pede, a página executa (com CORS normal) --- */
  function consoleSend(q) {
    if (!q || typeof q !== "object") return;
    var method = String(q.method || "GET").toUpperCase();
    if (!/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(method)) return;
    var url = String(q.url || "");
    if (!url || url.length > 8192 || /^(javascript|data|blob|file|chrome|chrome-extension):/i.test(url)) return;
    var headers = new Headers();
    (Array.isArray(q.headers) ? q.headers.slice(0, 50) : []).forEach(function (h) {
      try { if (Array.isArray(h) && h[0]) headers.append(String(h[0]), String(h[1] == null ? "" : h[1])); } catch (e) {}
    });
    var timeout = Math.max(1000, Math.min(120000, Number(q.timeout) || 30000));
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(new DOMException("Tempo esgotado.", "TimeoutError")); }, timeout);
    var body = method === "GET" || method === "HEAD" || q.body == null || q.body === "" ? undefined : String(q.body).slice(0, 5 * 1024 * 1024);
    consoleTag = true;
    W.fetch(url, { method: method, headers: headers, body: body, signal: ctrl.signal, credentials: "omit" })
      .catch(function () {})
      .then(function () { clearTimeout(t); });
  }
  /* ---------------- localStorage/sessionStorage/cookie na sandbox ----------------
   * O preview roda numa origem isolada, onde o navegador bloqueia o armazenamento.
   * Este substituto se comporta como o Storage real e o editor guarda os dados por projeto. */
  function makeStorage(initial, persist) {
    var data = {};
    for (var k0 in initial || {}) data[k0] = String(initial[k0]);
    function sync() {
      if (!persist) return;
      try { parentWin.postMessage({ __poiesis: 1, v: 1, s: SESSION, type: "storage", data: data }, origin); } catch (e) {}
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
      parentWin.postMessage({ __poiesis: 1, v: 1, s: SESSION, type: "log", level: level, args: args, src: src || null }, origin);
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
    try { parentWin.postMessage({ __poiesis: 1, v: 1, s: SESSION, type: "clear" }, origin); } catch (e) {}
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
    if (d && d.__poiesisNetSend) { consoleSend(d.__poiesisNetSend); return; }
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
      parentWin.postMessage({ __poiesis: 1, v: 1, s: SESSION, type: "open", href: a.href }, origin);
    } else {
      parentWin.postMessage({ __poiesis: 1, v: 1, s: SESSION, type: "navigate", path: resolve(href), hash: href.split("#")[1] || "" }, origin);
    }
  });

  W.addEventListener("load", function () {
    parentWin.postMessage({ __poiesis: 1, v: 1, s: SESSION, type: "ready", ms: Math.round(performance.now()) }, origin);
  });
})(/*__CFG__*/);
//# sourceURL=poiesis-runtime.js
