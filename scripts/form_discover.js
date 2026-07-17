(function () {
  function visible(el) {
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    var style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  // Returns a plain CSS selector, or "css >> n" meaning the nth match of css
  // (form_fill.js understands both forms).
  function nthOf(sel, el) {
    var matches = document.querySelectorAll(sel);
    if (matches.length === 1) return sel;
    for (var i = 0; i < matches.length; i++) {
      if (matches[i] === el) return sel + " >> " + i;
    }
    return sel;
  }

  function selectorFor(el) {
    if (el.id) return "#" + CSS.escape(el.id);
    var tag = el.tagName.toLowerCase();
    if (el.name) {
      if (el.type === "radio") {
        return nthOf(tag + '[name="' + el.name + '"][value="' + el.value + '"]', el);
      }
      return nthOf(tag + '[name="' + el.name + '"]', el);
    }
    return nthOf(tag, el);
  }

  function labelFor(el) {
    if (el.id) {
      var lab = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (lab) return lab.textContent.trim();
    }
    var wrap = el.closest("label");
    if (wrap) return wrap.textContent.trim();
    if (el.getAttribute("aria-label")) return el.getAttribute("aria-label");
    var ref = el.getAttribute("aria-labelledby");
    if (ref) {
      var refEl = document.getElementById(ref.split(" ")[0]);
      if (refEl) return refEl.textContent.trim();
    }
    return el.placeholder || "";
  }

  var fields = [];
  var els = document.querySelectorAll('input, textarea, select, [contenteditable="true"]');
  els.forEach(function (el, i) {
    var tag = el.tagName.toLowerCase();
    var type = tag === "input" ? (el.type || "text") : tag;
    if (type === "hidden" || !visible(el)) return;
    var field = {
      index: fields.length,
      selector: selectorFor(el),
      tag: tag,
      type: el.hasAttribute("contenteditable") ? "contenteditable" : type,
      label: labelFor(el).substring(0, 120),
      placeholder: el.placeholder || undefined,
      required: el.required || undefined,
      disabled: el.disabled || undefined
    };
    if (type === "password") {
      field.value = el.value ? "•••" : "";
    } else if (type === "checkbox" || type === "radio") {
      field.value = el.value;
      field.checked = el.checked;
    } else if (tag === "select") {
      field.value = el.value;
      field.options = Array.prototype.map.call(el.options, function (o) {
        return { value: o.value, text: o.text, selected: o.selected || undefined };
      });
    } else if (field.type === "contenteditable") {
      field.value = el.textContent.substring(0, 200);
    } else {
      field.value = el.value;
    }
    fields.push(field);
  });
  return JSON.stringify(fields);
})();
