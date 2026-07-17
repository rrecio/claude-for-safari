(function () {
  var frames = [];
  document.querySelectorAll("iframe, frame").forEach(function (f, i) {
    var rect = f.getBoundingClientRect();
    var sameOrigin = false;
    try { sameOrigin = !!f.contentDocument; } catch (e) {}
    frames.push({
      index: i,
      src: f.src || "(no src)",
      id: f.id || undefined,
      title: f.title || undefined,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      visible: rect.width > 0 && rect.height > 0,
      sameOrigin: sameOrigin
    });
  });
  return JSON.stringify(frames);
})();
