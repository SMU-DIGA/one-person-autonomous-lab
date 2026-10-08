// The digest's search box (site/digest.py: search_bar). No network on an issue page, one small file on the index.
//   digest/<id>.html  filters the issue in place: its papers (themes, keyword panels, highlights, the top three) and news
//   digest.html       searches every issue's papers through data/digest/search.json, results grouped by issue
// A paper matches when every term of the query occurs in its title, id, authors, key result, or the names and terms
// of its themes and keywords, in either language; "quoted words" are one term. The query is kept in ?q=.
// digest.html also filters by issue type and date range, alone or with a query (?type=, ?range= or ?from=&to=).
(function () {
  "use strict";
  var form = document.querySelector("form.dsearch");
  if (!form) return;
  var root = document.documentElement;
  var input = form.querySelector("input");
  var clearBtn = form.querySelector(".ds-clear");
  var count = form.querySelector(".ds-count");
  var script = document.currentScript || document.querySelector('script[src*="digest.js"]');
  var version = "";
  try { version = new URL(script.src).searchParams.get("v") || ""; } catch (e) {}

  // ------------------------------------------------------------------------------------------------- helpers
  function lang() { return root.classList.contains("lang-zh") ? "zh" : "en"; }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]; });
  }
  function bi(zh, en) { return '<span class="zh">' + zh + '</span><span class="en">' + en + "</span>"; }
  function norm(s) { return (s || "").replace(/\s+/g, " ").toLowerCase(); }
  function terms(q) {
    var out = [], re = /"([^"]*)"|(\S+)/g, m;
    while ((m = re.exec(q || ""))) {
      var t = norm(m[1] !== undefined ? m[1] : m[2]).trim().replace(/^"|"$/g, "");
      if (t && out.indexOf(t) < 0) out.push(t);
    }
    return out;
  }
  function hit(doc, ts) {
    for (var i = 0; i < ts.length; i++) if (doc.indexOf(ts[i]) < 0) return false;
    return true;
  }
  // the visible text of an element, its text nodes joined by spaces (the zh and en spans sit side by side);
  // labels ("Key result", "Matched phrases"…) and counts are left out
  function textOf(el) {
    if (!el) return "";
    var out = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null), n;
    while ((n = w.nextNode())) if (!n.parentNode.closest(".label,.kw-n,.n,script,summary,button")) out.push(n.nodeValue);
    return out.join(" ");
  }
  function markRe(ts) {
    if (!ts.length) return null;
    var parts = ts.slice().sort(function (a, b) { return b.length - a.length; }).map(function (t) {
      return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
    });
    return new RegExp(parts.join("|"), "gi");
  }
  function unmark(el) {
    if (!el) return;
    var ms = el.querySelectorAll("mark.ds-m");
    for (var i = 0; i < ms.length; i++) {
      var p = ms[i].parentNode;
      p.replaceChild(document.createTextNode(ms[i].textContent), ms[i]);
      p.normalize();
    }
  }
  function mark(el, re) {
    if (!el || !re) return;
    var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null), nodes = [], n;
    while ((n = w.nextNode())) if (n.nodeValue.trim() && !n.parentNode.closest("mark,script,.label")) nodes.push(n);
    nodes.forEach(function (node) {
      var s = node.nodeValue, last = 0, frag = null, m;
      re.lastIndex = 0;
      while ((m = re.exec(s))) {
        if (!m[0].length) { re.lastIndex++; continue; }
        frag = frag || document.createDocumentFragment();
        frag.appendChild(document.createTextNode(s.slice(last, m.index)));
        var mk = document.createElement("mark");
        mk.className = "ds-m";
        mk.textContent = m[0];
        frag.appendChild(mk);
        last = m.index + m[0].length;
      }
      if (frag) {
        frag.appendChild(document.createTextNode(s.slice(last)));
        node.parentNode.replaceChild(frag, node);
      }
    });
  }
  function show(el, on) { if (el) el.classList.toggle("ds-out", !on); }
  function plural(n, en1, enN) { return n === 1 ? en1 : enN; }

  // the placeholder and the clear button's name follow the page's language
  function syncLang() {
    var l = lang();
    input.placeholder = input.getAttribute("data-ph-" + l) || input.placeholder;
    clearBtn.setAttribute("aria-label", clearBtn.getAttribute("data-label-" + l) || "Clear");
  }
  syncLang();
  if (window.MutationObserver) new MutationObserver(syncLang).observe(root, {attributes: true, attributeFilter: ["class"]});

  // ------------------------------------------------------------------------------------------- an issue page
  function issueSearch() {
    var main = document.querySelector("main.digest") || document.body;
    var ctx = {}, own = {}, docs = {};
    var entries = [].slice.call(main.querySelectorAll("[data-pid]"));
    var themes = [].slice.call(main.querySelectorAll("article.theme"));
    var panels = [].slice.call(main.querySelectorAll(".kw-panel"));
    var news = [].slice.call(main.querySelectorAll(".news-item"));
    function add(map, pid, s) { map[pid] = (map[pid] || "") + " " + s; }
    function codes(el) { return el ? [].map.call(el.querySelectorAll("code"), function (c) { return c.textContent; }).join(" ") : ""; }
    // a paper carries the names of its themes and keywords, and its keywords' matched phrases (each of which occurs in
    // the paper); a theme's key terms describe the theme as a whole, so they are not the paper's
    themes.forEach(function (th) {
      var name = textOf(th.querySelector("h3"));
      [].forEach.call(th.querySelectorAll("li[data-pid]"), function (li) { add(ctx, li.getAttribute("data-pid"), name); });
    });
    panels.forEach(function (p) {
      var name = textOf(p.querySelector("h3")) + " " + codes(p.querySelector(".terms"));
      var ids = [].map.call(p.querySelectorAll("li[data-pid]"), function (li) { return li.getAttribute("data-pid"); });
      ids.concat((p.getAttribute("data-more") || "").split(" ")).forEach(function (pid) { if (pid) add(ctx, pid, name); });
    });
    var parts = function (el) {   // where an entry's own text is, and where its matches are marked
      return el.tagName === "ARTICLE" ? [].slice.call(el.querySelectorAll("h3,.meta,.kr,.why")) : [el];
    };
    entries.forEach(function (el) {
      var pid = el.getAttribute("data-pid");
      add(own, pid, pid + " " + parts(el).map(textOf).join(" "));
    });
    Object.keys(own).forEach(function (pid) { docs[pid] = norm(own[pid] + " " + (ctx[pid] || "")); });
    var newsDocs = news.map(function (n) { return norm(textOf(n)); });
    var chips = {};
    [].forEach.call(main.querySelectorAll("button.kw[aria-controls]"), function (b) { chips[b.getAttribute("aria-controls")] = b; });
    var glance = main.querySelector(".glance-sec");
    var glanceTop = main.querySelector(".glance-top");
    var sections = [[".themes", themes], [".papers", main.querySelectorAll("article.paper")], [".news", news]].map(function (s) {
      var box = main.querySelector(s[0]);
      return {sec: box && box.closest("section"), items: [].slice.call(s[1])};
    });
    var marked = [];

    function hitsLabel(n) { return bi(n + " 篇匹配", n + " matching"); }

    return function run(q) {
      var ts = terms(q), on = ts.length > 0, re = markRe(ts);
      marked.forEach(unmark);
      marked = [];
      var ok = {}, nPapers = 0;
      Object.keys(docs).forEach(function (pid) { if (!on || hit(docs[pid], ts)) { ok[pid] = true; nPapers++; } });
      entries.forEach(function (el) {
        var yes = !!ok[el.getAttribute("data-pid")];
        show(el, yes);
        if (on && yes) marked = marked.concat(parts(el));
      });
      themes.forEach(function (th) {
        var n = th.querySelectorAll("li[data-pid]:not(.ds-out)").length;
        show(th, !on || n > 0);
        var det = th.querySelector("details"), sum = det && det.querySelector("summary");
        if (sum) {
          var h = sum.querySelector(".ds-hits");
          if (!h) { h = document.createElement("span"); h.className = "ds-hits"; sum.appendChild(h); }
          h.innerHTML = on && n ? " · " + hitsLabel(n) : "";
        }
        if (on && n) marked.push(th.querySelector("h3"), th.querySelector(".terms"));
      });
      panels.forEach(function (p) {
        var n = p.querySelectorAll("li[data-pid]:not(.ds-out)").length;
        var chip = chips[p.id];
        if (chip) chip.classList.toggle("ds-dim", on && n === 0);
        if (on && n) marked.push(p.querySelector("h3"), p.querySelector(".terms"), chip && chip.querySelector(".kw-name"));
      });
      // a list with matches inside a closed <details> opens while searching, and closes again after
      [].forEach.call(main.querySelectorAll(".theme details, .kw-more"), function (det) {
        var n = det.querySelectorAll("li[data-pid]:not(.ds-out)").length;
        if (on && n && !det.open) { det.open = true; det.setAttribute("data-ds-opened", ""); }
        else if ((!on || !n) && det.hasAttribute("data-ds-opened")) { det.open = false; det.removeAttribute("data-ds-opened"); }
      });
      var nNews = 0;
      news.forEach(function (el, i) {
        var yes = !on || hit(newsDocs[i], ts);
        show(el, yes);
        if (on && yes) { nNews++; marked.push(el); }
      });
      if (glanceTop) show(glanceTop, !on || glanceTop.querySelectorAll("li[data-pid]:not(.ds-out)").length > 0);
      if (glance) {
        var anyChip = main.querySelectorAll("button.kw:not(.ds-dim)").length > 0;
        show(glance, !on || anyChip || (glanceTop && !glanceTop.classList.contains("ds-out")));
      }
      sections.forEach(function (s) {
        if (s.sec) show(s.sec, !on || s.items.some(function (x) { return !x.classList.contains("ds-out"); }));
      });
      marked.forEach(function (el) { mark(el, re); });
      if (!on) count.innerHTML = "";
      else if (!nPapers && !nNews) count.innerHTML = bi("没有匹配", "Nothing matches");
      else if (!nPapers) count.innerHTML = bi(nNews + " 条新闻匹配", nNews + " news " + plural(nNews, "item matches", "items match"));
      else {
        var zh = nPapers + " 篇匹配" + (nNews ? "，另有 " + nNews + " 条新闻" : "");
        var en = nPapers + " " + plural(nPapers, "paper matches", "papers match") +
          (nNews ? ", and " + nNews + " news " + plural(nNews, "item", "items") : "");
        count.innerHTML = bi(zh, en);
      }
    };
  }

  // a link to #p-<id> from digest.html: open what hides the entry (a keyword panel, a closed list), then go to it
  function revealTarget() {
    var id = decodeURIComponent((location.hash || "").slice(1));
    if (!/^p-/.test(id)) return;
    var el = document.getElementById(id);
    if (!el) return;
    var panel = el.closest(".kw-panel");
    if (panel && panel.hidden) {
      var chip = document.querySelector('button.kw[aria-controls="' + panel.id + '"]');
      if (chip) chip.click();
    }
    for (var d = el.closest("details"); d; d = d.parentNode.closest("details")) d.open = true;
    el.classList.add("ds-target");
    requestAnimationFrame(function () { el.scrollIntoView({block: "center"}); });
  }

  // ------------------------------------------------------------------------------------------------ the index
  function indexSearch() {
    var results = document.getElementById("ds-results");
    var list = document.getElementById("ds-issues");
    var data = null, rows = null, loading = null, pending = "";
    var MAX_PER_ISSUE = 8, MAX_ISSUES = 40;
    function nm(x) { return typeof x === "string" ? [x, x] : x; }   // [en, zh]
    function load() {
      if (!loading) {
        var src = form.getAttribute("data-index") + (version ? "?v=" + version : "");
        loading = fetch(src).then(function (r) {
          if (!r.ok) throw new Error(r.status);
          return r.json();
        }).then(function (d) {
          data = d;
          rows = [];
          d.papers.forEach(function (p) {
            p.in.forEach(function (o) {
              var is = d.issues[o[0]];
              var names = o[1].map(function (i) { return nm(is.th[i]); }).concat(o[2].map(function (j) { return nm(is.kw[j]); }));
              rows.push({p: p, issue: o[0], top: !!o[3], names: names,
                         doc: norm([p.t, p.id, is.id].concat(names.map(function (x) { return x.join(" "); })).join(" "))});
            });
          });
          run(pending);
        }).catch(function () {
          loading = null;
          count.innerHTML = bi("无法加载搜索索引", "The search index could not be loaded");
        });
      }
      return loading;
    }
    input.addEventListener("focus", load, {once: true});

    // the filters (site/digest.py: filters): the issue type, and a date range, either a preset counted back from the last
    // day an issue covers or from-to; a weekly is in the range when any day of its week is. Kept in ?type=&range=&from=&to=.
    var fbox = form.querySelector(".ds-filters");
    var fromIn = document.getElementById("ds-from"), toIn = document.getElementById("ds-to");
    var none = document.getElementById("ds-none");
    var issueRows = [].slice.call(list.querySelectorAll(".issue-row[data-kind]"));
    var weeks = [].slice.call(list.querySelectorAll(".issue-week"));
    var FIRST = fbox ? fbox.getAttribute("data-first") : "", LAST = fbox ? fbox.getAttribute("data-last") : "";
    var BACK = {"1w": [0, 7], "1m": [1, 0], "3m": [3, 0]};   // [months, days] back from the last day
    var DAY = /^\d{4}-\d{2}-\d{2}$/;
    var f = {type: "", range: "", from: "", to: ""};
    function preset(r) {
      var b = BACK[r];
      if (!b || !LAST) return ["", ""];
      var d = new Date(LAST + "T00:00:00Z");
      if (b[0]) d.setUTCMonth(d.getUTCMonth() - b[0]); else d.setUTCDate(d.getUTCDate() - b[1]);
      d.setUTCDate(d.getUTCDate() + 1);
      return [d.toISOString().slice(0, 10), LAST];
    }
    function span() {   // [from, to]; "" is open
      var w = f.range ? preset(f.range) : [f.from, f.to];
      return w[0] && w[1] && w[0] > w[1] ? [w[1], w[0]] : w;
    }
    function active() { return !!(f.type || f.range || f.from || f.to); }
    function keep(kind, s, e) {
      if (f.type && kind !== f.type) return false;
      var w = span();
      return (!w[0] || e >= w[0]) && (!w[1] || s <= w[1]);
    }
    function keepIssue(is) { return keep(is.kind, is.s || is.date, is.e || is.date); }
    function clamp(x) { return !x ? "" : FIRST && x < FIRST ? FIRST : LAST && x > LAST ? LAST : x; }
    function syncFilters() {   // the buttons and the date fields show the state
      if (!fbox) return;
      [].forEach.call(fbox.querySelectorAll("button[data-type]"), function (b) {
        b.setAttribute("aria-pressed", String(b.getAttribute("data-type") === f.type));
      });
      [].forEach.call(fbox.querySelectorAll("button[data-range]"), function (b) {
        var r = b.getAttribute("data-range");
        b.setAttribute("aria-pressed", String(r ? r === f.range : !f.range && !f.from && !f.to));
      });
      var w = f.range ? preset(f.range).map(clamp) : [f.from, f.to];
      if (document.activeElement !== fromIn) fromIn.value = w[0];   // not under the reader's typing
      if (document.activeElement !== toIn) toIn.value = w[1];
      toIn.min = fromIn.value || FIRST;
      fromIn.max = toIn.value || LAST;
    }
    function filterList() {
      var n = 0;
      issueRows.forEach(function (r) {
        var ok = keep(r.getAttribute("data-kind"), r.getAttribute("data-s"), r.getAttribute("data-e"));
        r.hidden = !ok;
        if (ok) n++;
      });
      weeks.forEach(function (w) { w.hidden = !w.querySelector(".issue-row:not([hidden])"); });
      if (none) none.hidden = n > 0 || !issueRows.length;
      return n;
    }
    function changed() {
      syncFilters();
      run(input.value);
      writeURL();
    }
    if (fbox) {
      fbox.addEventListener("click", function (ev) {
        var b = ev.target.closest("button[data-type],button[data-range]");
        if (!b) return;
        if (b.hasAttribute("data-type")) f.type = b.getAttribute("data-type");
        else { f.range = b.getAttribute("data-range"); f.from = f.to = ""; }
        changed();
      });
      [fromIn, toIn].forEach(function (el) {
        el.addEventListener("change", function () {
          f.range = "";
          f.from = DAY.test(fromIn.value) ? fromIn.value : "";
          f.to = DAY.test(toIn.value) ? toIn.value : "";
          changed();
        });
      });
      try {
        var sp = new URLSearchParams(location.search);
        f.type = /^(daily|weekly)$/.test(sp.get("type") || "") ? sp.get("type") : "";
        f.range = BACK[sp.get("range")] ? sp.get("range") : "";
        if (!f.range) {
          f.from = DAY.test(sp.get("from") || "") ? sp.get("from") : "";
          f.to = DAY.test(sp.get("to") || "") ? sp.get("to") : "";
        }
      } catch (e) {}
      syncFilters();
    }

    function href(id, q, pid) {
      return "digest/" + encodeURIComponent(id) + ".html?" + (version ? "v=" + version + "&" : "") + "q=" + encodeURIComponent(q) +
        (pid ? "#p-" + encodeURIComponent(pid) : "");
    }
    function run(q) {
      pending = q;
      var ts = terms(q);
      if (!ts.length) {      // the list of issues, filtered
        results.hidden = true;
        results.innerHTML = "";
        list.hidden = false;
        var n = filterList();
        count.innerHTML = !active() ? "" : !n ? bi("没有符合筛选条件的一期", "No issue matches") :
          bi("共 " + issueRows.length + " 期中的 " + n + " 期", n + " of " + issueRows.length + " " + plural(issueRows.length, "issue", "issues"));
        return;
      }
      if (!data) {
        count.innerHTML = bi("正在加载…", "Loading…");
        load();
        return;
      }
      var groups = {}, order = [], pids = {};
      var inIssue = data.issues.map(keepIssue);
      rows.forEach(function (r) {
        if (!inIssue[r.issue] || !hit(r.doc, ts)) return;
        if (!groups[r.issue]) { groups[r.issue] = []; order.push(r.issue); }
        groups[r.issue].push(r);
        pids[r.p.id] = true;
      });
      order.sort(function (a, b) { return a - b; });   // newest issue first, as the list
      var nPapers = Object.keys(pids).length;
      list.hidden = true;
      results.hidden = false;
      if (!order.length) {
        results.innerHTML = '<div class="empty">' + (active() ? bi("在筛选的各期中没有匹配的论文。试试更少的词，或放宽筛选。",
          "No paper matches in the filtered issues. Try fewer words, or widen the filters.") :
          bi("没有匹配的论文。试试更少或更短的词。", "No paper matches. Try fewer or shorter words.")) + "</div>";
        count.innerHTML = bi("没有匹配", "Nothing matches");
        return;
      }
      count.innerHTML = bi(order.length + " 期中共 " + nPapers + " 篇匹配",
        nPapers + " " + plural(nPapers, "paper matches", "papers match") + " in " + order.length + " " + plural(order.length, "issue", "issues"));
      var html = order.slice(0, MAX_ISSUES).map(function (n) {
        var is = data.issues[n], g = groups[n];
        g.sort(function (a, b) { return b.top - a.top; });
        var weekly = is.kind === "weekly";
        var head = '<a class="ds-ghead" href="' + esc(href(is.id, q)) + '"><span class="when">' + bi(esc(is.l[0]), esc(is.l[1])) +
          '</span><span class="badge ' + (weekly ? "weekly" : "daily") + '">' + (weekly ? bi("周报", "Weekly") : bi("日报", "Daily")) +
          '</span><span class="count">' + bi(g.length + " 篇匹配", g.length + " " + plural(g.length, "match", "matches")) + "</span></a>";
        var items = g.slice(0, MAX_PER_ISSUE).map(function (r) {
          var why = r.names.filter(function (x) { return ts.some(function (t) { return norm(x.join(" ")).indexOf(t) >= 0; }); });
          if (!why.length) why = r.names.slice(0, 1);
          var ctx = why.slice(0, 3).map(function (x) { return x[0] === x[1] ? esc(x[0]) : bi(esc(x[1]), esc(x[0])); }).join(" · ");
          return '<li><a href="' + esc(href(is.id, q, r.p.id)) + '">' + esc(r.p.t) + "</a> " +
            (r.top ? '<span class="ds-top">' + bi("推荐", "Highlight") + "</span> " : "") +
            '<span class="muted mono">' + esc(r.p.id) + "</span>" + (ctx ? '<span class="ds-ctx">' + ctx + "</span>" : "") + "</li>";
        }).join("");
        var more = g.length > MAX_PER_ISSUE ? '<a class="ds-all" href="' + esc(href(is.id, q)) + '">' +
          bi("在本期查看全部 " + g.length + " 篇 →", "All " + g.length + " in this issue →") + "</a>" : "";
        return '<div class="ds-group">' + head + '<ol class="plist">' + items + "</ol>" + more + "</div>";
      }).join("");
      if (order.length > MAX_ISSUES) {
        html += '<p class="muted small">' + bi("只显示最近 " + MAX_ISSUES + " 期；输入更多词以缩小范围。",
          "Showing the latest " + MAX_ISSUES + " issues; add words to narrow the search.") + "</p>";
      }
      results.innerHTML = html;
      var re = markRe(ts);
      [].forEach.call(results.querySelectorAll(".ds-group li"), function (li) { mark(li, re); });
    }
    run.params = function () {
      return {type: f.type, range: f.range, from: f.range ? "" : f.from, to: f.range ? "" : f.to};
    };
    if (active()) run("");
    return run;
  }

  // -------------------------------------------------------------------------------------------- the box itself
  var run = form.getAttribute("data-scope") === "all" ? indexSearch() : issueSearch();
  var timer = null, last = null;
  function apply(now) {
    var q = input.value;
    clearBtn.hidden = !q;
    clearTimeout(timer);
    var go = function () {
      if (q === last) return;
      last = q;
      run(q);
      writeURL();
    };
    if (now) go(); else timer = setTimeout(go, 120);
  }
  // the query, and on digest.html the filters, in the address: a link restores them
  function writeURL() {
    try {
      var u = new URL(location.href), ps = run.params ? run.params() : {};
      ps.q = input.value.trim();
      ["q", "type", "range", "from", "to"].forEach(function (k) {
        if (ps[k]) u.searchParams.set(k, ps[k]); else u.searchParams.delete(k);
      });
      history.replaceState(history.state, "", u.pathname + u.search + u.hash);
    } catch (e) {}
  }
  input.addEventListener("input", function () { apply(false); });
  form.addEventListener("submit", function (ev) { ev.preventDefault(); apply(true); });
  input.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") {
      if (input.value) { input.value = ""; apply(true); ev.preventDefault(); }
      else input.blur();
    } else if (ev.key === "Enter") { ev.preventDefault(); apply(true); }
  });
  clearBtn.addEventListener("click", function () { input.value = ""; apply(true); input.focus(); });
  document.addEventListener("keydown", function (ev) {   // "/" jumps to the box
    if (ev.key !== "/" || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    var t = ev.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    ev.preventDefault();
    input.focus();
    input.select();
  });
  // a keyword's "Filter by this" fills the box with its name, as one quoted term
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest(".kw-filter");
    if (!b) return;
    input.value = '"' + (b.getAttribute("data-filter-" + lang()) || b.getAttribute("data-filter-en")) + '"';
    apply(true);
  });

  var q0 = null;
  try { q0 = new URLSearchParams(location.search).get("q"); } catch (e) {}
  if (q0) {
    input.value = q0;
    apply(true);
  }
  if (form.getAttribute("data-scope") === "issue") revealTarget();
})();
