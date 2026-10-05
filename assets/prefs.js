// Language and theme, applied before first paint.
// Language: ?lang= wins, then the saved choice, then the browser. Theme: the saved choice, else the system's.
(function () {
  var root = document.documentElement;
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var theme = get("opal-theme");
  if (theme === "light" || theme === "dark") root.setAttribute("data-theme", theme);
  function effectiveTheme() {
    var t = root.getAttribute("data-theme");
    if (t) return t;
    return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  var lang = null;
  try { lang = new URLSearchParams(location.search).get("lang"); } catch (e) {}
  if (lang !== "zh" && lang !== "en") lang = get("opal-lang");
  if (lang !== "zh" && lang !== "en") lang = /^zh\b/i.test(navigator.language || "") ? "zh" : "en";
  // Pages written in one language (the manifestos) declare it and are not toggled.
  var fixed = root.getAttribute("data-fixed-lang");
  if (!fixed) {
    root.classList.add("lang-" + lang);
    root.lang = lang === "zh" ? "zh-CN" : "en";
  }
  window.OPAL_LANG = fixed || lang;

  window.setLang = function (next) {
    root.classList.remove("lang-zh", "lang-en");
    root.classList.add("lang-" + next);
    root.lang = next === "zh" ? "zh-CN" : "en";
    window.OPAL_LANG = next;
    set("opal-lang", next);
  };

  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-toggle-lang]")) window.setLang(window.OPAL_LANG === "zh" ? "en" : "zh");
    if (e.target.closest("[data-toggle-theme]")) {
      var next = effectiveTheme() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      set("opal-theme", next);
    }
    var l = e.target.closest("[data-set-lang]");
    if (l) set("opal-lang", l.getAttribute("data-set-lang"));
  });
})();
