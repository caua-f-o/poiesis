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

  /* ---------------- inspetor ----------------
   * Desligado, não escuta nada além das mensagens do editor. Ligado (seleção), captura
   * mouse e teclado só enquanto escolhe. O desenho fica num shadow root fechado,
   * sem receber cliques. Tudo que sai daqui é texto com tamanho limitado. */
  var INS = { ids: new WeakMap(), nodes: new Map(), seq: 0, dyn: new WeakSet(), picking: false, sel: null, hover: null, overlay: null, changes: [], forced: {}, statesSheet: null };
  /* Elementos criados por script (createElement, innerHTML, cloneNode…) ficam marcados como
   * "dinâmicos": só os que vieram do HTML-fonte têm posição correspondente no código. */
  (function trackDynamic() {
    function markTree(n) {
      if (!n || n.nodeType !== 1 && n.nodeType !== 11) return;
      if (n.nodeType === 1) INS.dyn.add(n);
      var w = document.createTreeWalker(n, NodeFilter.SHOW_ELEMENT);
      for (var c = w.nextNode(); c; c = w.nextNode()) INS.dyn.add(c);
    }
    var D = Document.prototype, E = Element.prototype, N = Node.prototype;
    ["createElement", "createElementNS"].forEach(function (m) {
      var o = D[m];
      if (o) D[m] = function () { var el = o.apply(this, arguments); INS.dyn.add(el); return el; };
    });
    var oClone = N.cloneNode;
    N.cloneNode = function () { var c = oClone.apply(this, arguments); markTree(c); return c; };
    var oImport = D.importNode;
    if (oImport) D.importNode = function () { var c = oImport.apply(this, arguments); markTree(c); return c; };
    function wrapSetter(proto, prop, after) {
      var d = Object.getOwnPropertyDescriptor(proto, prop);
      if (!d || !d.set) return;
      Object.defineProperty(proto, prop, { configurable: true, enumerable: d.enumerable, get: d.get, set: function (v) { var parent = this.parentNode; d.set.call(this, v); after(this, parent); } });
    }
    wrapSetter(E, "innerHTML", function (el) { for (var c = el.firstElementChild; c; c = c.nextElementSibling) markTree(c); });
    wrapSetter(E, "outerHTML", function (_el, parent) { if (parent) for (var c = parent.firstElementChild; c; c = c.nextElementSibling) if (!INS.ids.has(c)) markTree(c); });
    var oAdj = E.insertAdjacentHTML;
    if (oAdj) E.insertAdjacentHTML = function (pos, html) {
      var before = new Set(); var host = /^(before|after)/i.test(pos) ? this.parentNode : this;
      if (host) for (var c = host.firstElementChild; c; c = c.nextElementSibling) before.add(c);
      oAdj.apply(this, arguments);
      if (host) for (var c2 = host.firstElementChild; c2; c2 = c2.nextElementSibling) if (!before.has(c2)) markTree(c2);
    };
    if (typeof Range !== "undefined" && Range.prototype.createContextualFragment) {
      var oFrag = Range.prototype.createContextualFragment;
      Range.prototype.createContextualFragment = function () { var f = oFrag.apply(this, arguments); markTree(f); return f; };
    }
  })();
  function isOriginal(n) { return !INS.dyn.has(n); }
  function injected(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el === INS.overlay) return true;
    if (el.hasAttribute("data-poiesis-runtime") || el.hasAttribute("data-poiesis-auto")) return true;
    if (el.tagName === "SCRIPT" && el.type === "importmap" && el.textContent.indexOf("@poiesis/") >= 0) return true;
    if (el.id === "__pz_states" || el.id === "__pz_cursor") return true;
    return false;
  }
  function nid(n) {
    var id = INS.ids.get(n);
    if (!id) { id = ++INS.seq; INS.ids.set(n, id); INS.nodes.set(id, new WeakRef(n)); }
    return id;
  }
  function byId(id) { var r = INS.nodes.get(id); var n = r && r.deref(); return n && n.isConnected ? n : null; }
  function clip(s, n) { s = String(s == null ? "" : s); return s.length > n ? s.slice(0, n) + "…" : s; }
  // nome usado para caminho/rótulo: <style> que veio de um <link> conta como link
  function stepTag(el) {
    var t = el.tagName.toLowerCase();
    if (t === "style" && el.hasAttribute("data-poiesis-file") && !el.hasAttribute("data-poiesis-auto")) return "link";
    return t;
  }
  function label(el) {
    var s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    if (typeof el.className === "string" && el.className.trim()) s += "." + el.className.trim().split(/\s+/).slice(0, 4).join(".");
    return clip(s, 120);
  }
  function kids(el) {
    var out = [];
    for (var c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 1 && !injected(c)) out.push(c);
      else if (c.nodeType === 3 && c.nodeValue.trim()) out.push(c);
      else if (c.nodeType === 8) out.push(c);
    }
    return out;
  }
  function pathOf(el) {
    if (!isOriginal(el)) return null;
    var out = [];
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (!isOriginal(n)) return null;
      var tag = stepTag(n), i = 0;
      for (var s = n.previousElementSibling; s; s = s.previousElementSibling) if (!injected(s) && isOriginal(s) && stepTag(s) === tag) i++;
      out.unshift({ tag: tag, i: i });
    }
    return out;
  }
  function byPath(path) {
    if (!Array.isArray(path) || !path.length) return null;
    var cur = null;
    for (var k = 0; k < path.length; k++) {
      var st = path[k] || {}, tag = String(st.tag || ""), idx = Number(st.i) || 0;
      if (!cur) { if (tag === "html") { cur = document.documentElement; continue; } cur = document.documentElement; }
      var found = findChild(cur, tag, idx);
      if (!found && cur === document.documentElement) found = findChild(document.body, tag, idx) || findChild(document.head, tag, idx);
      if (!found && cur.tagName === "TABLE") for (var c = cur.firstElementChild; c && !found; c = c.nextElementSibling) if (c.tagName === "TBODY") found = findChild(c, tag, idx);
      if (!found) return cur === document.documentElement ? null : cur;
      cur = found;
    }
    return cur;
  }
  function findChild(parent, tag, idx) {
    if (!parent) return null;
    var i = 0;
    for (var c = parent.firstElementChild; c; c = c.nextElementSibling) {
      if (injected(c) || !isOriginal(c) || stepTag(c) !== tag) continue;
      if (i++ === idx) return c;
    }
    return null;
  }
  function brief(n) {
    if (n.nodeType === 3) return { id: nid(n), type: "text", text: clip(n.nodeValue.trim(), 200) };
    if (n.nodeType === 8) return { id: nid(n), type: "comment", text: clip(n.nodeValue.trim(), 200) };
    var attrs = [];
    for (var i = 0; i < n.attributes.length && i < 30; i++) {
      var a = n.attributes[i];
      if (/^data-pz-/.test(a.name)) continue;
      attrs.push([clip(a.name, 100), clip(a.value, 300)]);
    }
    return { id: nid(n), type: "el", tag: n.tagName.toLowerCase(), attrs: attrs, count: kids(n).length, dynamic: !isOriginal(n) || undefined };
  }

  /* --- regras que se aplicam a um elemento --- */
  function specificity(sel) {
    var a = 0, b = 0, c = 0;
    var s = sel.replace(/:where\([^)]*\)/g, "").replace(/"[^"]*"|'[^']*'/g, "");
    s = s.replace(/:(?:is|not|has|matches)\(([^)]*)\)/g, function (_, inner) {
      var best = [0, 0, 0];
      inner.split(",").forEach(function (x) { var sp = specificity(x); if (sp[0] > best[0] || (sp[0] === best[0] && (sp[1] > best[1] || (sp[1] === best[1] && sp[2] > best[2])))) best = sp; });
      a += best[0]; b += best[1]; c += best[2];
      return " ";
    });
    a += (s.match(/#[\w-]+/g) || []).length;
    b += (s.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+(\([^)]*\))?/g) || []).length;
    c += (s.match(/(^|[\s>+~(])[a-zA-Z][\w-]*/g) || []).length + (s.match(/::[\w-]+/g) || []).length;
    return [a, b, c];
  }
  function cmpSpec(x, y) { return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; }
  var ruleRefs = new Map(), ruleIds = new WeakMap(), ruleSeq = 0;
  function ruleId(r) { var id = ruleIds.get(r); if (!id) { id = ++ruleSeq; ruleIds.set(r, id); ruleRefs.set(id, r); } return id; }
  function sheetFile(sheet) {
    var o = sheet.ownerNode;
    if (o && o.getAttribute) { var f = o.getAttribute("data-poiesis-file"); if (f) return f; if (o.tagName === "STYLE") return CFG.page || ""; }
    return sheet.href || "";
  }
  // usa o cssText (que o navegador serializa com os atalhos, ex. "margin: 4px 0px") em vez das longhands
  function decls(style) {
    var out = [], text = style.cssText || "", depth = 0, q = "", cur = "";
    function flush() {
      var d = cur.trim(); cur = "";
      if (!d) return;
      var i = d.indexOf(":"); if (i <= 0) return;
      var prop = d.slice(0, i).trim(), val = d.slice(i + 1).trim(), imp = /!\s*important\s*$/i.test(val);
      if (imp) val = val.replace(/\s*!\s*important\s*$/i, "");
      if (out.length < 200) out.push([prop, clip(val, 500), imp]);
    }
    for (var k = 0; k < text.length; k++) {
      var c = text.charAt(k);
      if (q) { if (c === "\\") { cur += c + text.charAt(++k); continue; } if (c === q) q = ""; }
      else if (c === '"' || c === "'") q = c;
      else if (c === "(") depth++;
      else if (c === ")") depth = Math.max(0, depth - 1);
      else if (c === ";" && depth === 0) { flush(); continue; }
      cur += c;
    }
    flush();
    return out;
  }
  function matchedRules(el) {
    var out = [], skipped = 0, order = 0;
    function walk(list, sheet, ctx) {
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        order++;
        if (r.type === 1 && r.selectorText) {
          if (r.selectorText.indexOf("data-pz-") >= 0) continue;
          var best = null;
          r.selectorText.split(",").forEach(function (part) {
            var p = part.trim();
            try { if (p && el.matches(p)) { var sp = specificity(p); if (!best || cmpSpec(sp, best) > 0) best = sp; } } catch (e) {}
          });
          if (best) out.push({ rule: r, sheet: sheet, spec: best, order: order, ctx: ctx });
        } else if (r.cssRules && (r.type === 4 || r.type === 12 || r.constructor.name === "CSSLayerBlockRule" || r.constructor.name === "CSSContainerRule")) {
          var c = ctx.slice();
          if (r.type === 4) { if (!W.matchMedia(r.conditionText || r.media.mediaText).matches) continue; c.push("@media " + (r.conditionText || r.media.mediaText)); }
          else if (r.type === 12) c.push("@supports " + r.conditionText);
          else if (r.constructor.name === "CSSLayerBlockRule") c.push("@layer " + (r.name || ""));
          else c.push("@container " + r.conditionText + " (não avaliado)");
          walk(r.cssRules, sheet, c);
        }
      }
    }
    for (var s = 0; s < document.styleSheets.length; s++) {
      var sh = document.styleSheets[s];
      if (sh.ownerNode && (sh.ownerNode.id === "__pz_states" || sh.ownerNode.id === "__pz_cursor")) continue;
      var rules;
      try { rules = sh.cssRules; } catch (e) { skipped++; continue; }
      walk(rules, sh, []);
    }
    out.sort(function (x, y) { return cmpSpec(y.spec, x.spec) || y.order - x.order; });
    return { list: out.slice(0, 80), skipped: skipped };
  }
  var PROPS = ["display", "position", "top", "right", "bottom", "left", "z-index", "box-sizing", "width", "height", "min-width", "max-width", "min-height", "max-height",
    "margin-top", "margin-right", "margin-bottom", "margin-left", "padding-top", "padding-right", "padding-bottom", "padding-left",
    "border-top-width", "border-right-width", "border-bottom-width", "border-left-width", "border-radius", "color", "background-color", "background-image",
    "font-family", "font-size", "font-weight", "line-height", "letter-spacing", "text-align", "opacity", "overflow", "flex-direction", "justify-content",
    "align-items", "gap", "grid-template-columns", "grid-template-rows", "transform", "transition", "box-shadow", "cursor", "visibility", "pointer-events"];
  function nodeInfo(el, allComputed) {
    var cs = getComputedStyle(el);
    var r = el.getBoundingClientRect();
    var px = function (p) { return parseFloat(cs.getPropertyValue(p)) || 0; };
    var m = matchedRules(el);
    var rules = m.list.map(function (x) {
      return { id: ruleId(x.rule), selector: clip(x.rule.selectorText, 500), file: clip(sheetFile(x.sheet), 300), ctx: x.ctx.map(function (c) { return clip(c, 200); }),
        spec: x.spec, decls: decls(x.rule.style), disabled: (x.rule.__pzOff ? Object.keys(x.rule.__pzOff) : []) };
    });
    // variáveis usadas nas regras (e as definidas nelas), resolvidas no elemento
    var vars = {}, used = [];
    rules.forEach(function (ru) { ru.decls.forEach(function (d) { if (d[0].indexOf("--") === 0) used.push(d[0]); (d[1].match(/--[\w-]+/g) || []).forEach(function (v) { used.push(v); }); }); });
    used.slice(0, 100).forEach(function (v) { var val = cs.getPropertyValue(v).trim(); if (val) vars[v] = clip(val, 300); });
    var anc = [];
    for (var a = el; a && a.nodeType === 1; a = a.parentElement) anc.unshift({ id: nid(a), label: label(a) });
    var computed = (allComputed ? Array.prototype.slice.call(cs) : PROPS).slice(0, 400).map(function (p) { return [p, clip(cs.getPropertyValue(p), 300)]; });
    var text = "";
    if (!el.firstElementChild) text = clip(el.textContent.trim(), 300);
    return {
      node: brief(el), label: label(el), ancestors: anc.slice(-12), path: pathOf(el), text: text,
      box: { x: r.left, y: r.top, w: r.width, h: r.height,
        margin: [px("margin-top"), px("margin-right"), px("margin-bottom"), px("margin-left")],
        border: [px("border-top-width"), px("border-right-width"), px("border-bottom-width"), px("border-left-width")],
        padding: [px("padding-top"), px("padding-right"), px("padding-bottom"), px("padding-left")] },
      inline: decls(el.style), rules: rules, skippedSheets: m.skipped, computed: computed,
      vars: Object.keys(vars).map(function (k) { return [k, vars[k]]; }),
      forced: INS.forced[nid(el)] || [], changes: INS.changes.slice(-100),
    };
  }

  /* --- desenho (overlay) --- */
  function overlayRoot() {
    if (INS.overlay && INS.overlay.isConnected) return INS.overlay.__root;
    var host = document.createElement("poiesis-inspector");
    host.style.cssText = "all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647";
    var root = host.attachShadow({ mode: "closed" });
    root.innerHTML = '<style>.b{position:fixed;box-sizing:border-box;pointer-events:none}.m{background:rgba(246,178,107,.35)}.bd{background:rgba(255,229,153,.45)}.p{background:rgba(147,196,125,.45)}.c{background:rgba(111,168,220,.45)}.sel{outline:2px solid #e2bb72;outline-offset:-1px}.lab{position:fixed;font:11px/1.4 ui-monospace,monospace;background:#1d1b16;color:#efe9dc;padding:2px 6px;border-radius:4px;white-space:nowrap;pointer-events:none;box-shadow:0 2px 6px rgba(0,0,0,.4)}.lab b{color:#e2bb72;font-weight:600}</style><div id="h"></div><div id="s"></div>';
    host.__root = root;
    document.documentElement.appendChild(host);
    INS.overlay = host;
    return root;
  }
  function boxes(el, layer, withLabel) {
    var root = overlayRoot(), box = root.getElementById(layer);
    box.textContent = "";
    if (!el || el.nodeType !== 1) return;
    var r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    var g = function (p) { return parseFloat(cs.getPropertyValue(p)) || 0; };
    function rect(cls, x, y, w, h) { var d = document.createElement("div"); d.className = "b " + cls; d.style.cssText = "left:" + x + "px;top:" + y + "px;width:" + Math.max(0, w) + "px;height:" + Math.max(0, h) + "px"; box.appendChild(d); }
    if (layer === "s") { rect("sel", r.left, r.top, r.width, r.height); return; }
    var mt = g("margin-top"), mr = g("margin-right"), mb = g("margin-bottom"), ml = g("margin-left");
    var bt = g("border-top-width"), br = g("border-right-width"), bb = g("border-bottom-width"), bl = g("border-left-width");
    var pt = g("padding-top"), pr = g("padding-right"), pb = g("padding-bottom"), pl = g("padding-left");
    rect("m", r.left - ml, r.top - mt, r.width + ml + mr, r.height + mt + mb);
    rect("bd", r.left, r.top, r.width, r.height);
    rect("p", r.left + bl, r.top + bt, r.width - bl - br, r.height - bt - bb);
    rect("c", r.left + bl + pl, r.top + bt + pt, r.width - bl - br - pl - pr, r.height - bt - bb - pt - pb);
    if (withLabel) {
      var lab = document.createElement("div");
      lab.className = "lab";
      var b = document.createElement("b"); b.textContent = label(el);
      lab.appendChild(b);
      lab.appendChild(document.createTextNode("  " + Math.round(r.width) + " × " + Math.round(r.height)));
      var top = r.top - mt - 22; if (top < 2) top = r.bottom + mb + 4;
      lab.style.cssText = "left:" + Math.max(2, Math.min(r.left, innerWidth - 260)) + "px;top:" + top + "px";
      box.appendChild(lab);
    }
  }
  function clearOverlay() { if (INS.overlay) { INS.overlay.remove(); INS.overlay = null; } }
  function redraw() {
    if (INS.hover) boxes(INS.hover, "h", true); else if (INS.overlay) INS.overlay.__root.getElementById("h").textContent = "";
    if (INS.sel && INS.sel.isConnected) boxes(INS.sel, "s"); else if (INS.overlay) INS.overlay.__root.getElementById("s").textContent = "";
  }
  W.addEventListener("scroll", function () { if (INS.overlay) redraw(); }, true);
  W.addEventListener("resize", function () { if (INS.overlay) redraw(); });

  function sendIns(ev, data) {
    try { parentWin.postMessage({ __poiesis: 1, v: 1, s: SESSION, type: "inspect", ev: ev, data: data }, origin); } catch (e) {}
  }
  function select(el, reveal) {
    if (!el || el.nodeType !== 1) return;
    INS.sel = el;
    if (reveal) try { el.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (e) {}
    redraw();
    sendIns("node", nodeInfo(el, false));
  }

  /* --- seleção com o mouse (só enquanto ativa) --- */
  function targetAt(e) {
    var el = document.elementFromPoint(e.clientX, e.clientY);
    return el && el !== INS.overlay ? el : null;
  }
  function onMove(e) { var el = targetAt(e); if (el && el !== INS.hover) { INS.hover = el; redraw(); } }
  function block(e) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); }
  function onClick(e) { block(e); var el = targetAt(e); stopPick(); if (el) select(el, false); }
  function onKey(e) { if (e.key === "Escape") { block(e); stopPick(); sendIns("stopped", {}); } }
  var BLOCKED = ["mousedown", "mouseup", "pointerdown", "pointerup", "dblclick", "contextmenu", "auxclick"];
  function startPick() {
    if (INS.picking) return;
    INS.picking = true;
    W.addEventListener("mousemove", onMove, true);
    W.addEventListener("click", onClick, true);
    W.addEventListener("keydown", onKey, true);
    BLOCKED.forEach(function (t) { W.addEventListener(t, block, true); });
    var cur = document.createElement("style");
    cur.id = "__pz_cursor";
    cur.textContent = "*{cursor:crosshair!important}";
    (document.head || document.documentElement).appendChild(cur);
  }
  function stopPick() {
    if (!INS.picking) return;
    INS.picking = false;
    W.removeEventListener("mousemove", onMove, true);
    W.removeEventListener("click", onClick, true);
    W.removeEventListener("keydown", onKey, true);
    BLOCKED.forEach(function (t) { W.removeEventListener(t, block, true); });
    var cur = document.getElementById("__pz_cursor");
    if (cur) cur.remove();
    INS.hover = null;
    redraw();
  }

  /* --- estados forçados (:hover, :focus…) via cópia das regras --- */
  var STATES = ["hover", "focus", "active", "focus-visible", "focus-within"];
  function rebuildStates() {
    var css = [];
    for (var s = 0; s < document.styleSheets.length; s++) {
      var sh = document.styleSheets[s];
      if (sh.ownerNode && (sh.ownerNode.id === "__pz_states" || sh.ownerNode.id === "__pz_cursor")) continue;
      var rules; try { rules = sh.cssRules; } catch (e) { continue; }
      (function walk(list, wrapOpen, wrapClose) {
        for (var i = 0; i < list.length; i++) {
          var r = list[i];
          if (r.type === 1 && /:(hover|focus|active|focus-visible|focus-within)\b/.test(r.selectorText)) {
            var sel = r.selectorText.replace(/:(focus-visible|focus-within|hover|focus|active)\b/g, function (_, st) { return "[data-pz-" + st + "]"; });
            css.push(wrapOpen + sel + "{" + r.style.cssText + "}" + wrapClose);
          } else if (r.type === 4 && r.cssRules) walk(r.cssRules, wrapOpen + "@media " + r.media.mediaText + "{", "}" + wrapClose);
        }
      })(rules, "", "");
    }
    var st = document.getElementById("__pz_states");
    if (!st) { st = document.createElement("style"); st.id = "__pz_states"; document.head.appendChild(st); }
    st.textContent = css.join("\n");
  }
  function forceState(el, state, on) {
    if (STATES.indexOf(state) < 0) return;
    var id = nid(el), list = INS.forced[id] || [];
    if (on && list.indexOf(state) < 0) list.push(state);
    if (!on) list = list.filter(function (x) { return x !== state; });
    INS.forced[id] = list;
    if (on) el.setAttribute("data-pz-" + state, ""); else el.removeAttribute("data-pz-" + state);
    rebuildStates();
  }

  /* --- edição temporária --- */
  var PROP_RE = /^(--[\w-]+|-?[a-z][a-z-]*)$/;
  function noteChange(target, file, prop, old, val) {
    INS.changes = INS.changes.filter(function (c) { return !(c.target === target && c.prop === prop); });
    if (old !== val) INS.changes.push({ target: clip(target, 300), file: clip(file || "", 300), prop: prop, old: clip(old, 300), value: clip(val, 300) });
  }
  function setInline(el, prop, value, important) {
    if (!PROP_RE.test(prop)) return;
    var old = el.style.getPropertyValue(prop);
    if (value === "") el.style.removeProperty(prop); else el.style.setProperty(prop, value, important ? "important" : "");
    noteChange(label(el) + " (style)", "", prop, old, el.style.getPropertyValue(prop));
  }
  function setRule(r, prop, value, enabled) {
    if (!r || !PROP_RE.test(prop)) return;
    var old = r.style.getPropertyValue(prop);
    r.__pzOff = r.__pzOff || {};
    if (enabled === false) {
      if (old) { r.__pzOff[prop] = [old, r.style.getPropertyPriority(prop)]; r.style.removeProperty(prop); }
      noteChange(r.selectorText, sheetFile(r.parentStyleSheet), prop, old, "(desligado)");
      return;
    }
    if (enabled === true && r.__pzOff[prop]) { var o = r.__pzOff[prop]; delete r.__pzOff[prop]; r.style.setProperty(prop, o[0], o[1]); noteChange(r.selectorText, sheetFile(r.parentStyleSheet), prop, "", o[0]); return; }
    if (value === "") r.style.removeProperty(prop); else r.style.setProperty(prop, value, r.style.getPropertyPriority(prop));
    noteChange(r.selectorText, sheetFile(r.parentStyleSheet), prop, old, r.style.getPropertyValue(prop));
  }

  function inspectCmd(q) {
    if (!q || typeof q !== "object") return;
    var el = q.id != null ? byId(Number(q.id)) : null;
    switch (q.op) {
      case "pick": startPick(); break;
      case "stop": stopPick(); INS.sel = null; INS.hover = null; clearOverlay(); break;
      case "root":
        sendIns("children", { id: 0, nodes: [brief(document.documentElement)] });
        if (q.reselect && INS.sel && INS.sel.isConnected) select(INS.sel, false);
        break;
      case "children": if (el) sendIns("children", { id: nid(el), nodes: kids(el).slice(0, 500).map(brief) }); break;
      case "select": if (el) select(el, true); break;
      case "hover": INS.hover = el && el.nodeType === 1 ? el : null; redraw(); break;
      case "computed": if (el) sendIns("node", nodeInfo(el, true)); break;
      case "byPath": { var t = byPath(q.path); if (t) select(t, true); else sendIns("error", { message: "Elemento não encontrado no preview (pode ter sido criado ou removido por script)." }); break; }
      case "find": {
        var term = String(q.q || "").toLowerCase().slice(0, 200), res = [];
        if (term) {
          var w = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT);
          for (var n = w.currentNode; n && res.length < 200; n = w.nextNode()) {
            if (injected(n) || n.closest && n.closest("poiesis-inspector")) continue;
            if (label(n).toLowerCase().indexOf(term) >= 0 || (!n.firstElementChild && n.textContent.toLowerCase().indexOf(term) >= 0)) res.push({ id: nid(n), label: label(n), text: n.firstElementChild ? "" : clip(n.textContent.trim(), 80) });
          }
        }
        sendIns("found", { q: term, items: res });
        break;
      }
      case "inline": if (el) { setInline(el, String(q.prop || "").trim().toLowerCase(), String(q.value == null ? "" : q.value).slice(0, 2000), !!q.important); select(el, false); } break;
      case "rule": { var r = ruleRefs.get(Number(q.rule)); setRule(r, String(q.prop || "").trim().toLowerCase(), String(q.value == null ? "" : q.value).slice(0, 2000), q.enabled === true ? true : q.enabled === false ? false : undefined); if (el) select(el, false); break; }
      case "state": if (el) { forceState(el, String(q.state), !!q.on); select(el, false); } break;
    }
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
    if (d && d.__poiesisInspect) { try { inspectCmd(d.__poiesisInspect); } catch (err) { sendIns("error", { message: String(err && err.message || err) }); } return; }
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
