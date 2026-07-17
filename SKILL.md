---
name: claude-for-safari
description: Control the user's real Safari browser on macOS using AppleScript and screencapture. This skill should be used when the user asks to interact with Safari, browse websites, read web pages, automate browser tasks, take screenshots of web content, monitor a page's network requests, read iframe content, drive private browsing windows, or when any task would benefit from seeing or interacting with what's in their browser. Triggers on keywords like "safari", "browser", "web page", "open tab", "screenshot the page", "read this site", "browse", "click on", "fill in the form", "network requests", "iframe", "private window".
---

# Claude for Safari

Operate the user's real Safari browser on macOS via AppleScript (`osascript`) and `screencapture`. This provides full access to the user's actual browser session — including login state, cookies, and open tabs — without any extensions or additional software.

**Required: always show the control indicator.** Whenever controlling Safari — clicking, typing, navigating, scrolling, filling forms — the visual control indicator (section 15) must be visible on the tab being driven. Inject `scripts/control_border.js` before the first action on a tab, re-inject it after every navigation, and remove it with `scripts/control_border_remove.js` only when the task is done. Read-only queries (listing tabs, reading a page once) don't require it; anything that acts on a page does.

## Prerequisites

This skill is macOS-only by nature (Safari only exists on macOS). Fail fast on other platforms: `[ "$(uname)" = "Darwin" ]`.

Before first use, verify two settings are enabled. Run this check at the start of every session:

```bash
osascript -e 'tell application "Safari" to get name of front window' 2>&1
```

If this fails, instruct the user to enable:
1. **System Settings > Privacy & Security > Automation** — grant terminal app permission to control Safari
2. **Safari > Settings > Advanced** — enable "Show features for web developers", then **Develop menu > Allow JavaScript from Apple Events**

If step 1 is granted but `do JavaScript` fails with an "Allow JavaScript from Apple Events" error, you can enable it for the user (ask first — it is a security setting):

```bash
defaults write com.apple.Safari AllowJavaScriptFromAppleEvents -bool true
```

Verified: this takes effect immediately, no Safari restart needed. If JS stays blocked, use the [Vision Fallback Mode](#13-vision-fallback-mode-coordinate-interaction) — it needs no JS at all.

## Bundled Scripts

Reusable JavaScript lives in this skill's `scripts/` directory (`$SKILL_DIR` below means the directory containing this SKILL.md). Inject a script file with this JXA pattern — the file passes through an environment variable, so no quote-escaping is ever needed:

```bash
JS=$(cat "$SKILL_DIR/scripts/net_monitor.js") osascript -l JavaScript -e '
const safari = Application("Safari");
const js = $.NSProcessInfo.processInfo.environment.objectForKey("JS").js;
safari.doJavaScript(js, {in: safari.windows[0].currentTab()});
'
```

The last expression's value is printed. To target a specific tab use `safari.windows[0].tabs[N-1]` (JXA indexes from 0; AppleScript's `tab N` is 1-based).

| Script | Purpose |
|---|---|
| `scripts/net_monitor.js` | Install in-page network logging (fetch + XHR) — see section 11 |
| `scripts/net_read.js` | Read the network log as JSON — see section 11 |
| `scripts/list_frames.js` | List all iframes with origin classification — see section 12 |
| `scripts/dialog_guard.js` | Neutralize alert/confirm/prompt before risky clicks — see section 14 |
| `scripts/form_discover.js` | List every form field with selector, label, type, options — see section 7 |
| `scripts/form_fill.js` | Fill a whole form in one pass with per-field results — see section 7 |
| `scripts/control_border.js` | Show the "Claude is controlling this tab" border — see section 15 |
| `scripts/control_border_remove.js` | Remove the control-indicator border — see section 15 |
| `scripts/safari_wid.swift` | Window-ID helper for background screenshots — see section 4 |

## Core Capabilities

### 1. List All Open Tabs

```bash
osascript -e '
tell application "Safari"
  set output to ""
  repeat with w from 1 to (count of windows)
    repeat with t from 1 to (count of tabs of window w)
      set tabName to name of tab t of window w
      set tabURL to URL of tab t of window w
      set output to output & "W" & w & "T" & t & " | " & tabName & " | " & tabURL & linefeed
    end repeat
  end repeat
  return output
end tell'
```

### 2. Read Page Content

Read the full text content of the current tab:

```bash
osascript -e '
tell application "Safari"
  do JavaScript "document.body.innerText" in current tab of front window
end tell'
```

Read structured content (title, URL, meta description, headings):

```bash
osascript -e '
tell application "Safari"
  do JavaScript "JSON.stringify({
    title: document.title,
    url: location.href,
    description: document.querySelector(\"meta[name=description]\")?.content || \"\",
    h1: [...document.querySelectorAll(\"h1\")].map(e => e.textContent).join(\" | \"),
    h2: [...document.querySelectorAll(\"h2\")].map(e => e.textContent).join(\" | \")
  })" in current tab of front window
end tell'
```

Read a simplified DOM (similar to Chrome ACP's `browser_read`):

```bash
osascript -e '
tell application "Safari"
  do JavaScript "
    (function() {
      const walk = (node, depth) => {
        let result = \"\";
        for (const child of node.childNodes) {
          if (child.nodeType === 3) {
            const text = child.textContent.trim();
            if (text) result += text + \"\\n\";
          } else if (child.nodeType === 1) {
            const tag = child.tagName.toLowerCase();
            if ([\"script\",\"style\",\"noscript\",\"svg\"].includes(tag)) continue;
            const style = getComputedStyle(child);
            if (style.display === \"none\" || style.visibility === \"hidden\") continue;
            if ([\"h1\",\"h2\",\"h3\",\"h4\",\"h5\",\"h6\"].includes(tag))
              result += \"#\".repeat(parseInt(tag[1])) + \" \";
            if (tag === \"a\") result += \"[\";
            if (tag === \"img\") result += \"[Image: \" + (child.alt || \"\") + \"]\\n\";
            else if (tag === \"input\") result += \"[Input \" + child.type + \": \" + (child.value || child.placeholder || \"\") + \"]\\n\";
            else if (tag === \"button\") result += \"[Button: \" + child.textContent.trim() + \"]\\n\";
            else result += walk(child, depth + 1);
            if (tag === \"a\") result += \"](\" + child.href + \")\\n\";
            if ([\"p\",\"div\",\"li\",\"tr\",\"br\",\"h1\",\"h2\",\"h3\",\"h4\",\"h5\",\"h6\"].includes(tag))
              result += \"\\n\";
          }
        }
        return result;
      };
      return walk(document.body, 0).substring(0, 50000);
    })()
  " in current tab of front window
end tell'
```

### 3. Execute JavaScript

Run arbitrary JavaScript in the page context and get the return value:

```bash
osascript -e '
tell application "Safari"
  do JavaScript "YOUR_JS_CODE_HERE" in current tab of front window
end tell'
```

For multi-line scripts, use a heredoc:

```bash
osascript << 'APPLESCRIPT'
tell application "Safari"
  do JavaScript "
    (function() {
      // Multi-line JS here
      return 'result';
    })()
  " in current tab of front window
end tell
APPLESCRIPT
```

### 4. Screenshot

Two approaches are available. Auto-detect which to use at session start:

```bash
# Compile the window-ID helper, then test if background capture works
# (produces a file only when Screen Recording permission is granted)
[ -f /tmp/safari_wid ] || swiftc "$SKILL_DIR/scripts/safari_wid.swift" -o /tmp/safari_wid
rm -f /tmp/safari_probe.png
WID=$(/tmp/safari_wid) && screencapture -l "$WID" -o -x /tmp/safari_probe.png 2>/dev/null
[ -s /tmp/safari_probe.png ] && echo "BACKGROUND_SCREENSHOT=true" || echo "BACKGROUND_SCREENSHOT=false"
```

#### Background Screenshot (requires Screen Recording permission)

If the user has granted Screen Recording permission to the terminal app, use `screencapture -l` to capture Safari **without activating it**:

```bash
# Compile the helper once per session (if not already compiled)
[ -f /tmp/safari_wid ] || swiftc "$SKILL_DIR/scripts/safari_wid.swift" -o /tmp/safari_wid

# Capture the frontmost Safari window in background (no activation needed)
WID=$(/tmp/safari_wid)
screencapture -l "$WID" -o -x /tmp/safari_screenshot.png
```

With multiple Safari windows, list them all and pick by title (`windowID<TAB>title` per line, front-to-back):

```bash
/tmp/safari_wid --all
```

To enable this, instruct the user: **System Settings > Privacy & Security > Screen Recording** — grant permission to the terminal app (Terminal / iTerm / Warp).

#### Foreground Screenshot (no extra permissions needed)

If Screen Recording is not granted, fall back to region-based capture. This briefly activates Safari (~0.5s), then switches back:

```bash
# Remember current frontmost app
FRONT_APP=$(osascript -e 'tell application "System Events" to get name of first process whose frontmost is true')

# Activate Safari and capture its window region
osascript -e 'tell application "Safari" to activate'
sleep 0.3
BOUNDS=$(osascript -e '
tell application "System Events"
  tell process "Safari"
    -- Safari may expose a thin toolbar as window 1; find the largest window
    set bestW to 0
    set bestBounds to ""
    repeat with i from 1 to (count of windows)
      set {x, y} to position of window i
      set {w, h} to size of window i
      if w * h > bestW then
        set bestW to w * h
        set bestBounds to (x as text) & "," & (y as text) & "," & (w as text) & "," & (h as text)
      end if
    end repeat
    return bestBounds
  end tell
end tell')
screencapture -x -R "$BOUNDS" /tmp/safari_screenshot.png

# Switch back to the previous app
osascript -e "tell application \"$FRONT_APP\" to activate"
```

After capturing with either method, read the screenshot to see what's on screen:

```
Use the Read tool on /tmp/safari_screenshot.png to view the captured image.
```

### 5. Navigate

Open a URL in the current tab:

```bash
osascript -e '
tell application "Safari"
  set URL of current tab of front window to "https://example.com"
end tell'
```

Open a URL in a new tab:

```bash
osascript -e '
tell application "Safari"
  tell front window
    set newTab to make new tab with properties {URL:"https://example.com"}
    set current tab to newTab
  end tell
end tell'
```

Open a URL in a new window:

```bash
osascript -e 'tell application "Safari" to make new document with properties {URL:"https://example.com"}'
```

### 6. Click Elements

Click using JavaScript (preferred — works with SPAs and reactive frameworks):

```bash
osascript -e '
tell application "Safari"
  do JavaScript "
    const el = document.querySelector(\"button.submit\");
    if (el) {
      el.dispatchEvent(new MouseEvent(\"click\", {bubbles: true, cancelable: true}));
      \"clicked\";
    } else {
      \"element not found\";
    }
  " in current tab of front window
end tell'
```

**Important**: Use `dispatchEvent(new MouseEvent(..., {bubbles: true}))` instead of `.click()` for React/Vue/Angular compatibility. Native `.click()` may bypass synthetic event handlers.

### 7. Type and Fill Forms

Set input values via JavaScript:

```bash
osascript -e '
tell application "Safari"
  do JavaScript "
    const input = document.querySelector(\"input[name=search]\");
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, \"value\").set;
    nativeSetter.call(input, \"search text\");
    input.dispatchEvent(new Event(\"input\", {bubbles: true}));
    input.dispatchEvent(new Event(\"change\", {bubbles: true}));
  " in current tab of front window
end tell'
```

**Important**: For React-controlled inputs, use the native setter + `dispatchEvent` pattern shown above. Directly setting `.value` will not trigger React's state update.

**Verify, don't type blind.** Before setting a value, focus the target and confirm it; after setting, read the value back:

```bash
osascript -e '
tell application "Safari"
  do JavaScript "
    const input = document.querySelector(\"input[name=search]\");
    input.focus();
    const focused = document.activeElement === input;
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, \"value\").set;
    nativeSetter.call(input, \"search text\");
    input.dispatchEvent(new Event(\"input\", {bubbles: true}));
    JSON.stringify({focusedCorrectly: focused, valueReadBack: input.value})
  " in current tab of front window
end tell'
```

**Structured form filling** — to fill a whole form, first discover its fields with `scripts/form_discover.js` (inject via the [Bundled Scripts](#bundled-scripts) pattern). It returns JSON for every visible field: selector, type, resolved label, current value, select options, checked state, required/disabled flags. Passwords are masked; hidden inputs are skipped. Selectors are plain CSS or `"css >> n"` (nth match) — pass them back verbatim.

Then set the fill spec and inject `scripts/form_fill.js`:

```bash
osascript -e 'tell application "Safari" to do JavaScript "
window.__claudeFormFill = [
  {selector: \"#fullname\", value: \"Jane Doe\"},
  {selector: \"#country\", value: \"Brazil\"},
  {selector: \"input[name=\\\"subscribe\\\"]\", value: true},
  {selector: \"input[name=\\\"plan\\\"][value=\\\"pro\\\"]\", value: true}
]; \"spec set\"" in current tab of front window'

JS=$(cat "$SKILL_DIR/scripts/form_fill.js") osascript -l JavaScript -e '
const safari = Application("Safari");
const js = $.NSProcessInfo.processInfo.environment.objectForKey("JS").js;
safari.doJavaScript(js, {in: safari.windows[0].currentTab()});
'
```

It handles every field kind with framework-compatible events — text/textarea (native setter from the correct prototype), select (match by option value or visible text), checkbox/radio (click events), contenteditable — and returns per-field results: `{selector, status: "filled" | "not-found" | "disabled" | "option-not-found", valueAfter}`. Check `valueAfter` — it is the read-back verification.

**Never pass passwords through this flow** — values end up in shell commands and transcripts. For password fields, focus the field via JS and let the user type, or use System Events keystrokes.

Type via System Events (simulates real keyboard — useful when JS injection is blocked). System Events keystrokes go to whatever has focus, so make the activate + keystroke one atomic `osascript` call — never separate calls, as focus can shift between them — and verify afterwards (read the value via JS, or screenshot):

```bash
osascript -e '
tell application "Safari" to activate
delay 0.3
tell application "System Events"
  if name of first process whose frontmost is true is not "Safari" then error "Safari not frontmost — aborting keystroke"
  keystroke "hello world"
end tell'
```

Press special keys:

```bash
osascript -e '
tell application "System Events"
  key code 36  -- Enter/Return
  key code 48  -- Tab
  key code 51  -- Delete/Backspace
  keystroke "a" using command down  -- Cmd+A (select all)
  keystroke "c" using command down  -- Cmd+C (copy)
end tell'
```

### 8. Scroll

```bash
# Scroll down 500px
osascript -e 'tell application "Safari" to do JavaScript "window.scrollBy(0, 500)" in current tab of front window'

# Scroll to top
osascript -e 'tell application "Safari" to do JavaScript "window.scrollTo(0, 0)" in current tab of front window'

# Scroll to bottom
osascript -e 'tell application "Safari" to do JavaScript "window.scrollTo(0, document.body.scrollHeight)" in current tab of front window'

# Scroll element into view
osascript -e 'tell application "Safari" to do JavaScript "document.querySelector(\"#target\").scrollIntoView({behavior: \"smooth\"})" in current tab of front window'
```

### 9. Switch Tabs

```bash
# Switch to tab 2 in the front window
osascript -e 'tell application "Safari" to set current tab of front window to tab 2 of front window'

# Switch to a tab by URL match
osascript -e '
tell application "Safari"
  repeat with t from 1 to (count of tabs of front window)
    if URL of tab t of front window contains "github.com" then
      set current tab of front window to tab t of front window
      exit repeat
    end if
  end repeat
end tell'
```

### 10. Wait for Page Load

**Pitfall**: a newly created tab reports `readyState === "complete"` for its initial `about:blank` document *before* navigation commits. Always check the URL too:

```bash
osascript -e '
tell application "Safari"
  -- Wait until the target page finishes loading (max 15 seconds)
  repeat 30 times
    try
      set pageState to do JavaScript "location.href.indexOf(\"example.com\") !== -1 && document.readyState === \"complete\" ? \"ready\" : \"loading\"" in current tab of front window
      if pageState is "ready" then exit repeat
    end try
    delay 0.5
  end repeat
end tell'
```

For SPAs that load data after `readyState` completes, wait for network idle using the monitor from section 11 (inject it first): poll until `window.__claudeNet.pending` is `0` for ~1 second.

### 11. Network Monitoring

`do JavaScript` cannot see network traffic by itself, but an in-page shim can. Inject `scripts/net_monitor.js` (idempotent — safe to inject repeatedly) using the pattern from [Bundled Scripts](#bundled-scripts). It wraps `fetch` and `XMLHttpRequest`, logging method, URL, status, duration, content type, and capped request/response body snippets to `window.__claudeNet.log` (ring buffer, 200 entries). On install it also seeds the log from `performance.getEntriesByType("resource")`, so requests that fired before injection appear too (URL + timing only, no bodies).

Read the log with `scripts/net_read.js`. To filter, set a query first:

```bash
osascript -e 'tell application "Safari" to do JavaScript "window.__claudeNetQuery = {match: \"api\", limit: 20}" in current tab of front window'
JS=$(cat "$SKILL_DIR/scripts/net_read.js") osascript -l JavaScript -e '
const safari = Application("Safari");
const js = $.NSProcessInfo.processInfo.environment.objectForKey("JS").js;
safari.doJavaScript(js, {in: safari.windows[0].currentTab()});
'
```

The monitor does not survive navigation — re-inject after every page load. What it cannot see: service-worker traffic, the top-level document request, request/response headers, and bodies of requests that fired before injection.

### 12. Cross-Origin Iframes

The browser's same-origin policy blocks direct JS access to cross-origin frames, but two workarounds cover most needs. First enumerate frames with `scripts/list_frames.js` — it returns each frame's `src`, size, visibility, and whether it is `sameOrigin` (readable in place via `frame.contentDocument`).

For a cross-origin frame, open its `src` in a temporary tab, read it there, and close the tab:

```bash
osascript -e '
tell application "Safari"
  tell front window
    set tempTab to make new tab with properties {URL:"https://frame-src-here.example/"}
    set tempIndex to index of tempTab
  end tell
  repeat 30 times
    try
      set pageState to do JavaScript "location.href.indexOf(\"frame-src-here\") !== -1 && document.readyState === \"complete\" ? \"ready\" : \"loading\"" in tab tempIndex of front window
      if pageState is "ready" then exit repeat
    end try
    delay 0.5
  end repeat
  set frameText to do JavaScript "document.body.innerText" in tab tempIndex of front window
  close tab tempIndex of front window
  return frameText
end tell'
```

Caveats: frames that depend on the parent page (postMessage, auth context) may render differently standalone. Screenshots (section 4) always capture iframe pixels regardless of origin — use them when the temp-tab rendering differs.

### 13. Vision Fallback Mode (Coordinate Interaction)

When `do JavaScript` is unavailable — old Safari versions that block it in private windows, the Apple Events setting disabled, or a page where injection misbehaves — drive Safari purely with screenshots and coordinates. (Note: on current Safari — verified on Safari 26 — `do JavaScript` works in private windows too, so try it before falling back.)

The loop:

1. **Screenshot** the target window: `/tmp/safari_wid --all`, pick the window ID by title (private windows are titled "…, Private Browsing"), `screencapture -l "$WID" -o -x /tmp/shot.png`. Read the image.
2. **Get window bounds** in screen points via System Events (`position` + `size` of the window).
3. **Convert coordinates**: the screenshot is in physical pixels; on Retina displays `scale = imageWidth / windowWidth` (typically 2). A point of interest at image pixel `(px, py)` is at screen point `(windowX + px/scale, windowY + py/scale)`.
4. **Click** — activate, raise, and click in ONE atomic osascript call (focus can shift between separate calls, and window indices reorder after raising, so re-resolve the window by title every time):

```bash
osascript -e '
tell application "Safari" to activate
delay 0.5
tell application "System Events"
  tell process "Safari"
    repeat with i from 1 to (count of windows)
      if title of window i contains "Private Browsing" then
        perform action "AXRaise" of window i
        exit repeat
      end if
    end repeat
  end tell
  delay 0.3
  click at {552, 362} -- the screen point computed in step 3
end tell'
```

5. **Type** with System Events keystrokes (section 7); navigate with Cmd+L → type URL → Return.
6. **Screenshot again** to verify the result before the next action.

### 14. Dialog Handling

A native `alert()`/`confirm()` dialog blocks `do JavaScript` and every subsequent Apple Event — the session appears to hang. Prevent this: inject `scripts/dialog_guard.js` **before** clicking anything that might pop a dialog (delete buttons, logout links, unsaved-form navigation). It replaces `alert`/`confirm`/`prompt` with silent versions that log to `window.__claudeDialogs`, and neutralizes `beforeunload` prompts.

Control the answers before the click, and read what happened after:

```bash
# confirm() returns true by default; to decline: window.__claudeDialogAnswer = false
# prompt() returns its default; to answer: window.__claudeDialogPromptText = "my answer"
osascript -e 'tell application "Safari" to do JavaScript "JSON.stringify(window.__claudeDialogs)" in current tab of front window'
```

Recovery, if a dialog is already blocking scripting: dismiss it with System Events — activate Safari, then `key code 36` (Return, accepts) or `key code 53` (Escape, cancels).

### 15. Visual Control Indicator

**Required whenever the skill acts on a page** (see the rule at the top of this document): the user must always be able to see which tab is being controlled — a colored border plus a "Claude is controlling this tab" badge, like the Claude Chrome extension. Inject `scripts/control_border.js` (idempotent) before the first action on a tab, using the pattern from [Bundled Scripts](#bundled-scripts):

```bash
JS=$(cat "$SKILL_DIR/scripts/control_border.js") osascript -l JavaScript -e '
const safari = Application("Safari");
const js = $.NSProcessInfo.processInfo.environment.objectForKey("JS").js;
safari.doJavaScript(js, {in: safari.windows[0].currentTab()});
'
```

The indicator does not survive navigation — **re-inject after every page load** (right after the section 10 wait; injection is idempotent, so re-injecting blindly is safe). SPA route changes keep it alive. When finished with a tab, remove it with `scripts/control_border_remove.js` — and if the task touched several tabs, remove it from each.

Limits: the border frames the web content area only (not the toolbar), and cannot be shown where JS injection is blocked (vision-fallback mode has no indicator).

## Workflow: Browsing with Screenshot Feedback Loop

For tasks that require visual confirmation, use the screenshot loop:

1. Show the control indicator on the tab (section 15 — required)
2. Perform action (navigate, click, scroll, etc.)
3. Wait for page load if needed, then re-inject the control indicator
4. Take screenshot (background or foreground) → Read the image to see result
5. Decide next action based on what is visible
6. When the task is done, remove the control indicator

## Operating on Specific Tabs

To operate on a tab other than the current one, use `tab N of window M` syntax:

```bash
# Read content of tab 3 in window 1
osascript -e 'tell application "Safari" to do JavaScript "document.title" in tab 3 of window 1'

# Execute JS in a specific tab
osascript -e 'tell application "Safari" to do JavaScript "document.body.innerText.substring(0, 1000)" in tab 2 of front window'
```

Note: Background screenshots capture the entire Safari window (whichever tab is active). To screenshot a specific tab, first switch to it via AppleScript.

## Limitations & Workarounds

| Limitation | Workaround | Remaining gap |
|---|---|---|
| macOS only | None needed — Safari only exists on macOS. Fail fast elsewhere (see Prerequisites). | Inherent. |
| No native network interception | In-page fetch/XHR shim + performance entries — section 11. | Service workers, top-level document request, headers, pre-injection bodies. |
| Cross-origin iframes unreadable | Enumerate + read each frame in a temp tab — section 12. Screenshots capture frame pixels regardless. | Frames depending on parent postMessage/auth may render differently standalone. |
| Private browsing windows | On current Safari (verified on 26), `do JavaScript` works in private windows. On older versions, use Vision Fallback Mode — section 13. | Vision mode is slower: one screenshot round-trip per action. |
| System Events keystroke is "blind" | Focus-verify + read-back pattern, atomic activate+keystroke — section 7. | None in practice when the pattern is followed. |
| JS dialogs hang the session | Pre-inject dialog guard; Return/Escape recovery — section 14. | Dialogs fired before the guard is installed still need keyboard recovery. |
