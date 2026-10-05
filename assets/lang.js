// Language before first paint: ?lang= wins, then the saved choice, then the browser.
(function () {
  var lang = null;
  try { lang = new URLSearchParams(location.search).get("lang"); } catch (e) {}
  if (lang !== "zh" && lang !== "en") {
    try { lang = localStorage.getItem("opal-lang"); } catch (e) {}
  }
  if (lang !== "zh" && lang !== "en") {
    lang = /^zh\b/i.test(navigator.language || "") ? "zh" : "en";
  }
  var root = document.documentElement;
  root.classList.add("lang-" + lang);
  root.lang = lang === "zh" ? "zh-CN" : "en";
  window.OPAL_LANG = lang;
  window.setLang = function (next) {
    root.classList.remove("lang-zh", "lang-en");
    root.classList.add("lang-" + next);
    root.lang = next === "zh" ? "zh-CN" : "en";
    window.OPAL_LANG = next;
    try { localStorage.setItem("opal-lang", next); } catch (e) {}
    document.dispatchEvent(new CustomEvent("opal:lang", { detail: next }));
  };
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-toggle-lang]");
    if (t) window.setLang(window.OPAL_LANG === "zh" ? "en" : "zh");
  });
})();
