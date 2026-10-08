// Renders data/grants.json (written by `opal grants export`). Days left are recomputed from the deadline
// on every load, so a call that closed after the export moves to "awaiting results" instead of showing a stale count;
// results older than the publishing window and calls followed past their horizon drop out the same way.
(function () {
  var T = {
    status: {
      tight: ["即将截止", "Closing Soon"], open: ["开放申请", "Open"],
      rolling: ["滚动申请", "Rolling"], upcoming: ["即将开放", "Upcoming"],
      results: ["结果已公布", "Results Out"], awaiting_results: ["等待结果", "Awaiting Results"]
    },
    kind: {
      grant: ["科研资助", "Grant"], fellowship: ["Fellowship", "Fellowship"], compute_credits: ["算力 / API 额度", "Compute Credits"],
      award: ["奖项", "Award"], challenge: ["竞赛", "Challenge"], other: ["其他", "Other"]
    },
    funder: {
      government: ["政府", "Government"], industry: ["产业", "Industry"], foundation: ["基金会", "Foundation"],
      university: ["大学", "University"], other: ["其他", "Other"]
    },
    eligible: { yes: ["符合", "Yes"], unclear: ["不明确", "Unclear"], no: ["不符合", "No"] }
  };
  var ORDER = ["tight", "open", "rolling", "upcoming"];
  var state = { status: "all", funder: "all" };
  var data = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function bi(pair) { return '<span class="zh">' + esc(pair[0]) + '</span><span class="en">' + esc(pair[1]) + "</span>"; }
  function biRaw(zh, en) { return '<span class="zh">' + zh + '</span><span class="en">' + en + "</span>"; }
  function safeUrl(u) { return /^https?:\/\//i.test(u || "") ? esc(u) : "#"; }

  function today() {
    var d = new Date();
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function daysLeft(iso) {
    var p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!p) return null;
    return Math.round((Date.UTC(+p[1], +p[2] - 1, +p[3]) - today()) / 86400000);
  }

  function addDays(iso, n) {
    var p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    return p ? new Date(Date.UTC(+p[1], +p[2] - 1, +p[3] + n)).toISOString().slice(0, 10) : null;
  }

  // Re-apply the manager's deadline rule against today's date. A call past its deadline is followed for results.
  function live(o, rules) {
    var verified = o.deadline && (o.deadline_check === "exact" || o.deadline_check === "year_inferred");
    var days = verified ? daysLeft(o.deadline) : null;
    var status = o.status;
    if (days !== null) {
      if (days < 0) return Object.assign({}, o, { status: "awaiting_results", days_left: days,
        follow_until: addDays(o.deadline, rules.results_horizon_days || 365) });
      status = days < rules.min_days_to_deadline ? "tight" : "open";
    }
    return Object.assign({}, o, { status: status, days_left: days });
  }

  function chips() {
    var rows = data.rows;
    function count(k, v) { return rows.filter(function (r) { return v === "all" || r[k] === v; }).length; }
    function chip(k, v, label, n) {
      return '<button class="chip" type="button" data-k="' + k + '" data-v="' + v + '" aria-pressed="' + (state[k] === v) + '">' + label + " · " + n + "</button>";
    }
    var html = "";
    ["all"].concat(ORDER).forEach(function (s) {
      var n = count("status", s);
      if (s === "all" || n) html += chip("status", s, s === "all" ? biRaw("全部", "All") : bi(T.status[s]), n);
    });
    ["all", "government", "industry", "university", "foundation", "other"].forEach(function (f) {
      var n = count("funder_type", f);
      if (f === "all" || n) html += chip("funder", f, f === "all" ? biRaw("所有资助方", "All Funders") : bi(T.funder[f]), n);
    });
    document.getElementById("filters").innerHTML = html;
  }

  function quote(label, text, cls) {
    if (!text) return "";
    return '<div class="q' + (cls ? " " + cls : "") + '"><span class="label">' + label + "</span>" + text + "</div>";
  }

  var NEW = '<span class="badge new">' + biRaw("本周新发现", "New This Week") + "</span>";

  function card(o) {
    var when;
    if (o.days_left !== null && o.days_left !== undefined) {
      when = '<span class="mono">' + esc(o.deadline) + '</span> <span class="left">' +
        biRaw("还剩 " + o.days_left + " 天", o.days_left + (o.days_left === 1 ? " day" : " days")) + "</span>";
    } else if (o.status === "rolling") {
      when = biRaw("滚动申请", "Rolling") + ' <span class="left">' + biRaw("无固定截止", "no fixed date") + "</span>";
    } else {
      when = biRaw("尚未公布", "Not announced");
    }
    var fit = Math.max(0, Math.min(1, +o.fit || 0));
    var links = '<a href="' + safeUrl(o.url) + '" rel="noopener" target="_blank">' + biRaw("原网页", "Source") + " ↗</a>";
    if (o.apply_url && o.apply_url !== o.url) links += ' · <a href="' + safeUrl(o.apply_url) + '" rel="noopener" target="_blank">' + biRaw("申请入口", "Apply") + " ↗</a>";
    var h = '<article class="opp' + (o.new ? " is-new" : "") + '">';
    h += '<div class="title-cell"><div class="title"><h3>' + esc(o.program) + '</h3><span class="badge ' + esc(o.status) + '">' +
      bi(T.status[o.status] || ["", o.status]) + "</span>" + (o.new ? NEW : "") + "</div>";
    h += '<div class="funder">' + esc(o.funder) + " · " + bi(T.funder[o.funder_type] || T.funder.other) + " · " + bi(T.kind[o.kind] || T.kind.other) +
      (o.official ? "" : ' · <span class="warn">' + biRaw("非官方页面", "Unofficial Page") + "</span>") + " · " + links + "</div></div>";
    h += '<div class="cell"><span class="label">' + biRaw("截止日期", "Deadline") + "</span>" + when + "</div>";
    h += '<div class="cell"><span class="label">' + biRaw("金额", "Amount") + "</span>" + (o.amount ? esc(o.amount) : '<span class="left">' + biRaw("页面未写明", "Not stated") + "</span>") + "</div>";
    h += '<div class="cell"><span class="label">' + biRaw("契合度（解读）", "Fit (Interpretation)") + '</span><span class="fit"><span class="meter"><i style="width:' + Math.round(fit * 100) + '%"></i></span>' + fit.toFixed(2) + "</span></div>";
    if (o.summary) h += '<p class="sum">' + esc(o.summary) + "</p>";
    h += "<details><summary>" + biRaw("原文证据与解读", "Evidence and Interpretation") + "</summary><div class=\"evidence\">";
    h += quote(biRaw("截止日期原文", "Deadline (Quoted)"), o.deadline_quote && "“" + esc(o.deadline_quote) + "”");
    h += quote(biRaw("金额原文", "Amount (Quoted)"), o.amount_quote && "“" + esc(o.amount_quote) + "”");
    h += quote(biRaw("资格条件原文", "Eligibility (Quoted)"), o.eligibility_quote && "“" + esc(o.eligibility_quote) + "”");
    h += quote(biRaw("资格判断（解读）", "Eligible? (Interpretation)"),
      bi(T.eligible[o.eligible] || T.eligible.unclear) + (o.eligibility_reason ? " — " + esc(o.eligibility_reason) : ""), "interp");
    h += quote(biRaw("契合理由（解读）", "Why It Fits (Interpretation)"), o.fit_rationale && esc(o.fit_rationale), "interp");
    if ((o.also_seen_at || []).length) {
      h += quote(biRaw("同一机会也见于", "Also Found On"), o.also_seen_at.map(function (u) {
        return '<a href="' + safeUrl(u) + '" rel="noopener" target="_blank">' + esc(u.replace(/^https?:\/\//, "").slice(0, 60)) + "</a>";
      }).join("<br>"));
    }
    (o.flags || []).forEach(function (f) { h += '<div class="warnflag">⚠ ' + esc(f) + "</div>"; });
    h += '<div class="prov">' + biRaw("存档网页文本 sha256 ", "stored page text sha256 ") + esc(o.page_sha) + " · " +
      biRaw("首次发现 ", "first seen ") + esc((o.first_seen || "").slice(0, 10)) + "</div>";
    h += "</div></details></article>";
    return h;
  }

  function head(o) {
    return '<div class="title-cell"><div class="title"><h3>' + esc(o.program) + '</h3><span class="badge ' + esc(o.status) + '">' +
      bi(T.status[o.status] || ["", o.status]) + "</span>" + (o.new ? NEW : "") + "</div>" +
      '<div class="funder">' + esc(o.funder) + " · " + bi(T.funder[o.funder_type] || T.funder.other) + " · " + bi(T.kind[o.kind] || T.kind.other) +
      ' · <a href="' + safeUrl(o.url) + '" rel="noopener" target="_blank">' + biRaw("申请网页", "Call Page") + " ↗</a></div></div>";
  }
  function dateCell(label, iso, note) {
    return '<div class="cell"><span class="label">' + label + "</span>" + (iso ? '<span class="mono">' + esc(iso) + "</span>" : "—") +
      (note ? ' <span class="left">' + note + "</span>" : "") + "</div>";
  }
  function ago(iso) {
    var d = daysLeft(iso);
    return d === null || d > 0 ? "" : biRaw(-d + " 天前", -d + (d === -1 ? " day ago" : " days ago"));
  }

  // An announcement's date as the page states it; an undated one is placed by when the scout first found it.
  function annDate(a) { return a.announced || (a.found || "").slice(0, 10); }
  function annWhen(a) {
    return a.announced ? esc(a.announced) : biRaw("首次看到 " + esc(annDate(a)) + "（页面未写明公布日期）",
                                                  "first seen " + esc(annDate(a)) + " (the page gives no date)");
  }

  // One call whose results are out: each announcement's quote, its date and the page it is on.
  function resultCard(o) {
    var h = '<article class="opp res' + (o.new ? " is-new" : "") + '">' + head(o);
    var last = o.results[o.results.length - 1];
    h += last.announced ? dateCell(biRaw("结果公布于", "Announced"), last.announced, ago(last.announced))
                        : dateCell(biRaw("首次看到", "First Seen"), annDate(last), biRaw("页面未写明公布日期", "the page gives no date"));
    h += dateCell(biRaw("申请截止", "Deadline Was"), o.deadline);
    o.results.slice().reverse().forEach(function (a) {
      h += '<div class="q wide"><span class="label">' + biRaw("公布原文", "Announcement (Quoted)") + " · " + annWhen(a) + "</span>“" +
        esc(a.quote) + "” " + '<a href="' + safeUrl(a.url) + '" rel="noopener" target="_blank">' + (a.host ? esc(a.host) : biRaw("原网页", "Source")) + " ↗</a>" +
        (a.official ? "" : ' · <span class="warn">' + biRaw("非官方页面", "Unofficial Page") + "</span>") +
        (a.what ? '<span class="what">' + biRaw("公布内容：", "What was announced: ") + esc(a.what) + "</span>" : "") + "</div>";
    });
    h += "<details><summary>" + biRaw("原文证据", "Evidence") + '</summary><div class="evidence">';
    o.results.forEach(function (a) {
      h += quote(biRaw("公布日期原文", "Date (Quoted)"), a.date_quote && "“" + esc(a.date_quote) + "”");
      h += quote(biRaw("公布内容原文", "Outcome (Quoted)"), a.what_quote && "“" + esc(a.what_quote) + "”");
      (a.flags || []).forEach(function (f) { h += '<div class="warnflag">⚠ ' + esc(f) + "</div>"; });
      h += '<div class="prov">' + biRaw("结果网页文本 sha256 ", "results page text sha256 ") + esc(a.page_sha) + "</div>";
    });
    h += quote(biRaw("截止日期原文", "Deadline (Quoted)"), o.deadline_quote && "“" + esc(o.deadline_quote) + "”");
    h += '<div class="prov">' + biRaw("申请网页文本 sha256 ", "call page text sha256 ") + esc(o.page_sha) + "</div>";
    return h + "</div></details></article>";
  }

  // One closed call the scout follows until its results are announced or the horizon passes.
  function awaitingCard(o) {
    var h = '<article class="opp wait">' + head(o);
    h += dateCell(biRaw("申请截止", "Deadline Was"), o.deadline, ago(o.deadline));
    h += dateCell(biRaw("跟踪至", "Followed Until"), o.follow_until);
    h += "<details><summary>" + biRaw("原文证据", "Evidence") + '</summary><div class="evidence">';
    h += quote(biRaw("截止日期原文", "Deadline (Quoted)"), o.deadline_quote && "“" + esc(o.deadline_quote) + "”");
    h += '<div class="prov">' + biRaw("存档网页文本 sha256 ", "stored page text sha256 ") + esc(o.page_sha) + "</div>";
    return h + "</div></details></article>";
  }

  function lists() {
    document.getElementById("results-list").innerHTML = data.results.length ? data.results.map(resultCard).join("") :
      '<div class="empty">' + biRaw("近六个月内没有找到结果公布。", "No results announced in the last six months.") + "</div>";
    document.getElementById("awaiting-list").innerHTML = data.awaiting.length ? data.awaiting.map(awaitingCard).join("") :
      '<div class="empty">' + biRaw("目前没有等待结果的已截止申请。", "No closed calls are awaiting results.") + "</div>";
  }

  function fresh() {
    var rows = data.rows.filter(function (r) { return r.new; }).concat(data.results.filter(function (r) { return r.new; }));
    var block = document.getElementById("new-block");
    if (!block) return;
    block.hidden = !rows.length;
    document.getElementById("new-list").innerHTML = rows.map(function (r) { return r.status === "results" ? resultCard(r) : card(r); }).join("");
  }

  function render() {
    chips();
    var rows = data.rows.filter(function (r) {
      return (state.status === "all" || r.status === state.status) && (state.funder === "all" || r.funder_type === state.funder);
    });
    document.getElementById("cards").innerHTML = rows.length ? rows.map(card).join("") :
      '<div class="empty">' + biRaw("当前没有符合条件的机会。", "No opportunities match right now.") + "</div>";
  }

  function summary() {
    var rows = data.rows, doc = data.doc;
    function n(s) { return rows.filter(function (r) { return r.status === s; }).length; }
    function stat(v, label) { return "<span><b>" + v + "</b>" + label + "</span>"; }
    var scanned = doc.last_scan ? doc.last_scan.slice(0, 10) : "—";
    var recorded = Object.keys(doc.counts || {}).reduce(function (a, k) { return a + doc.counts[k]; }, 0);
    document.getElementById("summary").innerHTML =
      stat(rows.filter(function (r) { return r.new; }).length + data.results.filter(function (r) { return r.new; }).length,
           biRaw("本周新发现", "New This Week")) +
      stat(n("open") + n("tight"), biRaw("可申请", "Open Now")) +
      stat(n("tight"), biRaw("即将截止", "Closing Soon")) +
      stat(n("rolling") + n("upcoming"), biRaw("滚动 / 即将开放", "Rolling / Upcoming")) +
      stat(data.results.length, biRaw("结果已公布", "Results Out")) +
      stat(recorded, biRaw("共记录", "Recorded")) +
      '<span>' + biRaw("最近扫描 ", "Last Scan ") + '<span class="mono">' + esc(scanned) + "</span></span>";
    var a = doc.applicant || {};
    document.getElementById("stamp").textContent = [a.institution, a.country].filter(Boolean).join(", ");
  }

  document.getElementById("filters").addEventListener("click", function (e) {
    var b = e.target.closest(".chip");
    if (!b) return;
    state[b.dataset.k] = b.dataset.v;
    render();
  });

  fetch("data/grants.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (doc) {
      var rules = doc.rules || { min_days_to_deadline: 14 };
      var all = (doc.opportunities || []).map(function (o) { return live(o, rules); });
      var rows = all.filter(function (r) { return r.status !== "awaiting_results"; })
        .sort(function (a, b) {
          var s = ORDER.indexOf(a.status) - ORDER.indexOf(b.status);
          if (s) return s;
          var da = a.days_left == null ? 1e6 : a.days_left, db = b.days_left == null ? 1e6 : b.days_left;
          return da - db || b.fit - a.fit;
        });
      var now = new Date(today()).toISOString().slice(0, 10);
      var since = new Date(today() - (rules.results_publish_days || 183) * 86400000).toISOString().slice(0, 10);
      var results = (doc.results || []).filter(function (o) {
        return (o.results || []).length && annDate(o.results[o.results.length - 1]) >= since;
      });
      var awaiting = all.filter(function (r) { return r.status === "awaiting_results"; }).concat(doc.awaiting_results || [])
        .filter(function (o) { return !o.follow_until || o.follow_until >= now; })
        .sort(function (a, b) { return a.deadline < b.deadline ? 1 : a.deadline > b.deadline ? -1 : 0; });
      data = { doc: doc, rows: rows, results: results, awaiting: awaiting };
      summary();
      fresh();
      render();
      lists();
    })
    .catch(function () {
      ["results-list", "awaiting-list"].forEach(function (id) { document.getElementById(id).innerHTML = ""; });
      document.getElementById("cards").innerHTML = '<div class="empty">' +
        biRaw("无法加载 data/grants.json。本地预览请用 <code>python3 -m http.server</code>。",
              "Could not load data/grants.json. To preview locally, serve the folder with <code>python3 -m http.server</code>.") + "</div>";
    });
})();
