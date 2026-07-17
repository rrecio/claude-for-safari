(function () {
  if (window.__claudeNet) return "already installed (" + window.__claudeNet.log.length + " entries)";
  var state = { log: [], pending: 0 };
  window.__claudeNet = state;
  var MAX_ENTRIES = 200;
  var MAX_SNIPPET = 500;

  function push(entry) {
    state.log.push(entry);
    if (state.log.length > MAX_ENTRIES) state.log.splice(0, state.log.length - MAX_ENTRIES);
  }

  function snippet(s) {
    if (typeof s !== "string") return undefined;
    return s.length > MAX_SNIPPET ? s.slice(0, MAX_SNIPPET) + "…" : s;
  }

  // Seed with requests that fired before injection (URL + timing only, no bodies)
  try {
    performance.getEntriesByType("resource").forEach(function (r) {
      push({ src: "perf", type: r.initiatorType, url: r.name, durationMs: Math.round(r.duration) });
    });
  } catch (e) {}

  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : (input && input.url) || String(input);
      var method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
      var entry = { src: "fetch", method: method, url: url, startedAt: Date.now() };
      if (init && typeof init.body === "string") entry.requestBody = snippet(init.body);
      state.pending++;
      push(entry);
      return origFetch.apply(this, arguments).then(
        function (resp) {
          state.pending--;
          entry.status = resp.status;
          entry.durationMs = Date.now() - entry.startedAt;
          try {
            var ct = resp.headers.get("content-type") || "";
            entry.contentType = ct;
            if (/json|text/.test(ct)) {
              resp.clone().text().then(function (t) { entry.responseBody = snippet(t); }).catch(function () {});
            }
          } catch (e) {}
          return resp;
        },
        function (err) {
          state.pending--;
          entry.error = String(err);
          entry.durationMs = Date.now() - entry.startedAt;
          throw err;
        }
      );
    };
  }

  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__claudeEntry = { src: "xhr", method: String(method).toUpperCase(), url: String(url) };
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    var entry = this.__claudeEntry;
    if (entry) {
      entry.startedAt = Date.now();
      if (typeof body === "string") entry.requestBody = snippet(body);
      state.pending++;
      push(entry);
      this.addEventListener("loadend", function () {
        state.pending--;
        entry.status = this.status;
        entry.durationMs = Date.now() - entry.startedAt;
        try {
          if (this.responseType === "" || this.responseType === "text") {
            entry.responseBody = snippet(this.responseText);
          }
        } catch (e) {}
      });
    }
    return origSend.apply(this, arguments);
  };

  return "installed (seeded " + state.log.length + " earlier requests)";
})();
