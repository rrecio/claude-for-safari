(function () {
  if (!window.__claudeBorder) return "not shown";
  window.__claudeBorder.remove();
  delete window.__claudeBorder;
  return "removed";
})();
