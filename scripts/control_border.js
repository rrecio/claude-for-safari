(function () {
  if (window.__claudeBorder) return "already shown";
  var el = document.createElement("div");
  el.id = "__claude_control_border";
  el.setAttribute("style",
    "position:fixed;inset:0;border:3px solid #D97757;pointer-events:none;" +
    "z-index:2147483647;box-sizing:border-box;");
  var pill = document.createElement("div");
  pill.textContent = "Claude is controlling this tab";
  pill.setAttribute("style",
    "position:fixed;top:0;left:50%;transform:translateX(-50%);" +
    "background:#D97757;color:#fff;font:12px/1.6 -apple-system,sans-serif;" +
    "padding:1px 12px;border-radius:0 0 8px 8px;pointer-events:none;" +
    "z-index:2147483647;");
  el.appendChild(pill);
  (document.body || document.documentElement).appendChild(el);
  window.__claudeBorder = el;
  return "shown";
})();
