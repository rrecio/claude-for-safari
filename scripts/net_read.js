(function () {
  if (!window.__claudeNet) return "net monitor not installed — inject scripts/net_monitor.js first";
  var q = window.__claudeNetQuery || {};
  var log = window.__claudeNet.log;
  if (q.match) {
    log = log.filter(function (e) { return e.url && e.url.indexOf(q.match) !== -1; });
  }
  var limit = q.limit || 50;
  return JSON.stringify({
    pending: window.__claudeNet.pending,
    matched: log.length,
    entries: log.slice(-limit)
  });
})();
