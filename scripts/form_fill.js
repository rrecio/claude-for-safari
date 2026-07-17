(function () {
  var spec = window.__claudeFormFill;
  delete window.__claudeFormFill;
  if (!spec || !spec.length) return "no fill spec — set window.__claudeFormFill = [{selector, value}, …] first";

  function fire(el, type, EventCtor) {
    el.dispatchEvent(new (EventCtor || Event)(type, { bubbles: true, cancelable: true }));
  }

  function setNativeValue(el, value) {
    var proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement : window.HTMLInputElement;
    var setter = Object.getOwnPropertyDescriptor(proto.prototype, "value").set;
    setter.call(el, value);
  }

  // Selectors are plain CSS, or "css >> n" meaning the nth match of css
  // (the form produced by form_discover.js).
  function find(selector) {
    try {
      var parts = String(selector).split(" >> ");
      if (parts.length === 2) return document.querySelectorAll(parts[0])[parseInt(parts[1], 10)] || null;
      return document.querySelector(selector);
    } catch (e) { return null; }
  }

  var results = spec.map(function (item) {
    var el = find(item.selector);
    if (!el) return { selector: item.selector, status: "not-found" };
    if (el.disabled) return { selector: item.selector, status: "disabled" };

    var tag = el.tagName.toLowerCase();
    var type = tag === "input" ? (el.type || "text") : tag;

    if (type === "checkbox" || type === "radio") {
      var desired = type === "radio" ? item.value !== false : !!item.value;
      if (el.checked !== desired) fire(el, "click", MouseEvent);
      return { selector: item.selector, status: "filled", valueAfter: el.checked };
    }
    if (tag === "select") {
      var want = String(item.value);
      var match = null;
      for (var i = 0; i < el.options.length; i++) {
        if (el.options[i].value === want) { match = el.options[i]; break; }
      }
      if (!match) {
        for (var j = 0; j < el.options.length; j++) {
          if (el.options[j].text.trim().toLowerCase() === want.trim().toLowerCase()) { match = el.options[j]; break; }
        }
      }
      if (!match) return { selector: item.selector, status: "option-not-found" };
      el.value = match.value;
      fire(el, "input");
      fire(el, "change");
      return { selector: item.selector, status: "filled", valueAfter: el.value };
    }
    if (el.hasAttribute("contenteditable")) {
      el.focus();
      el.textContent = String(item.value);
      fire(el, "input", InputEvent);
      return { selector: item.selector, status: "filled", valueAfter: el.textContent };
    }
    // Text-like inputs and textareas
    el.focus();
    setNativeValue(el, String(item.value));
    fire(el, "input");
    fire(el, "change");
    return { selector: item.selector, status: "filled", valueAfter: el.value };
  });

  return JSON.stringify(results);
})();
