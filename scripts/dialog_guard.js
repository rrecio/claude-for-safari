(function () {
  if (window.__claudeDialogs) return "already installed (" + window.__claudeDialogs.length + " dialogs logged)";
  var log = [];
  window.__claudeDialogs = log;
  // confirm() answer — override before clicking: window.__claudeDialogAnswer = false
  if (window.__claudeDialogAnswer === undefined) window.__claudeDialogAnswer = true;

  window.alert = function (msg) {
    log.push({ type: "alert", message: String(msg) });
  };
  window.confirm = function (msg) {
    var answer = !!window.__claudeDialogAnswer;
    log.push({ type: "confirm", message: String(msg), answered: answer });
    return answer;
  };
  window.prompt = function (msg, def) {
    var answer = window.__claudeDialogPromptText !== undefined ? window.__claudeDialogPromptText : (def || "");
    log.push({ type: "prompt", message: String(msg), answered: answer });
    return answer;
  };
  // Neutralize "Leave this page?" dialogs that would block navigation
  window.onbeforeunload = null;
  window.addEventListener("beforeunload", function (e) { e.stopImmediatePropagation(); }, true);

  return "installed";
})();
