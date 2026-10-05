// Renders data/grants.json (written by `opal grants export`). Days left are recomputed from the deadline
// on every load, so a call that closed after the export disappears instead of showing a stale count.
(function () {
  var T = {
    status: {
      tight: ["即将截止", "Closing soon"], open: ["开放申请", "Open"],
      rolling: ["滚动申请", "Rolling"], upcoming: ["即将开放", "Upcoming"]
    },
    kind: {
      grant: ["科研资助", "Grant"], fellowship: ["Fellowship", "Fellowship"], compute_credits: ["算力 / API 额度", "Compute credits"],
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

  // Re-apply the manager's deadline rule against today's date.
  function live(o, rules) {
    var verified = o.deadline && (o.deadline_check === "exact" || o.deadline_check === "year_inferred");
    var days = verified ? daysLeft(o.deadline) : null;
    var status = o.status;
    if (days !== null) {
      if (days < 0) return null;
      status = days < rules.min_days_to_deadline ? "tight" : "open";
    }
    return Object.assign({}, o, { status: status, days_left: days });
  }

  function chips() {
    var rows = data.rows;
    function count(k, v) { return rows.filter(function (r) { return v === "all" || r[k] === v; }).length; }
    var html = "";
    ["all"].concat(ORDER).forEach(function (s) {
      var n = count("status", s);
      if (s !== "all" && !n) return;
      html += '<button class="chip" type="button" data-k="status" data-v="' + s + '" aria-pressed="' + (state.status === s) + '">' +
        (s === "all" ? biRaw("全部", "All") : bi(T.status[s])) + " · " + n + "</button>";
    });
    html += '<span style="width:12px"></span>';
    ["all", "government", "industry", "university", "foundation", "other"].forEach(function (f) {
      var n = count("funder_type", f);
      if (f !== "all" && !n) return;
      html += '<button class="chip" type="button" data-k="funder" data-v="' + f + '" aria-pressed="' + (state.funder === f) + '">' +
        (f === "all" ? biRaw("所有资助方", "All funders") : bi(T.funder[f])) + " · " + n + "</button>";
    });
    document.getElementById("filters").innerHTML = html;
  }

  function quote(label, text) {
    if (!text) return "";
    return '<div class="quote"><span class="k">' + label + "</span>“" + esc(text) + "”</div>";
  }

  function card(o) {
    var when;
    if (o.days_left !== null && o.days_left !== undefined) {
      when = '<span class="dl">' + esc(o.deadline) + "</span><br>" +
        biRaw("还剩 " + o.days_left + " 天", o.days_left + (o.days_left === 1 ? " day" : " days") + " left");
    } else if (o.status === "rolling") {
      when = biRaw("滚动申请，无固定截止", "Rolling, no fixed deadline");
    } else {
      when = biRaw("尚未公布", "Not announced yet");
    }
    var fit = Math.max(0, Math.min(1, +o.fit || 0));
    var h = '<article class="card">';
    h += '<div class="top"><h3>' + esc(o.program) + '</h3><span class="badge ' + esc(o.status) + '">' + bi(T.status[o.status] || ["", o.status]) + "</span></div>";
    h += '<div class="funder">' + esc(o.funder) + " · " + bi(T.funder[o.funder_type] || T.funder.other) + " · " + bi(T.kind[o.kind] || T.kind.other) +
      (o.official ? "" : ' · <strong style="color:var(--warn)">' + biRaw("非官方页面，请到官网核实", "Unofficial page — verify at source") + "</strong>") + "</div>";
    h += '<div class="facts">';
    h += "<div><span class=\"k\">" + biRaw("截止日期", "Deadline") + "</span>" + when + "</div>";
    h += "<div><span class=\"k\">" + biRaw("金额", "Amount") + "</span>" + (o.amount ? esc(o.amount) : '<span class="muted">' + biRaw("页面未写明", "Not stated on page") + "</span>") + "</div>";
    h += "<div><span class=\"k\">" + biRaw("契合度（解读）", "Fit (interpretation)") + '</span><span class="fit"><span class="meter"><i style="width:' + Math.round(fit * 100) + '%"></i></span>' + fit.toFixed(2) + "</span></div>";
    h += "</div>";
    if (o.summary) h += '<p class="sum">' + esc(o.summary) + "</p>";
    h += "<details><summary>" + biRaw("原文证据与解读", "Evidence from the page, and interpretation") + "</summary>";
    h += quote(biRaw("截止日期原文", "Deadline, as quoted"), o.deadline_quote);
    h += quote(biRaw("金额原文", "Amount, as quoted"), o.amount_quote);
    h += quote(biRaw("资格条件原文", "Eligibility, as quoted"), o.eligibility_quote);
    h += '<div class="quote interp"><span class="k">' + biRaw("资格判断（解读）", "Eligible? (interpretation)") + "</span>" +
      bi(T.eligible[o.eligible] || T.eligible.unclear) + (o.eligibility_reason ? " — " + esc(o.eligibility_reason) : "") + "</div>";
    if (o.fit_rationale) h += '<div class="quote interp"><span class="k">' + biRaw("契合理由（解读）", "Why it fits (interpretation)") + "</span>" + esc(o.fit_rationale) + "</div>";
    (o.flags || []).forEach(function (f) { h += '<div class="warnflag">⚠ ' + esc(f) + "</div>"; });
    h += '<div class="prov">' + biRaw("存档网页文本 sha256 ", "stored page text sha256 ") + esc(o.page_sha) + " · " +
      biRaw("首次发现 ", "first seen ") + esc((o.first_seen || "").slice(0, 10)) + "</div>";
    h += "</details>";
    h += '<div class="links"><a href="' + safeUrl(o.url) + '" rel="noopener" target="_blank">' + biRaw("原网页 ↗", "Source page ↗") + "</a>";
    if (o.apply_url && o.apply_url !== o.url) h += '<a href="' + safeUrl(o.apply_url) + '" rel="noopener" target="_blank">' + biRaw("申请入口 ↗", "Apply ↗") + "</a>";
    h += "</div></article>";
    return h;
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
    var scanned = doc.last_scan ? doc.last_scan.slice(0, 10) : "—";
    var recorded = Object.keys(doc.counts || {}).reduce(function (a, k) { return a + doc.counts[k]; }, 0);
    document.getElementById("summary").innerHTML =
      "<div><span class=\"k\">" + biRaw("可申请", "Open now") + '</span><div class="v">' + (n("open") + n("tight")) + "</div></div>" +
      "<div><span class=\"k\">" + biRaw("即将截止", "Closing soon") + '</span><div class="v">' + n("tight") + "</div></div>" +
      "<div><span class=\"k\">" + biRaw("滚动 / 即将开放", "Rolling / upcoming") + '</span><div class="v">' + (n("rolling") + n("upcoming")) + "</div></div>" +
      "<div><span class=\"k\">" + biRaw("最近扫描", "Last scan") + '</span><div class="v" style="font-size:22px">' + esc(scanned) + "</div>" +
      '<span class="muted" style="font-size:12.5px">' + biRaw("共记录 " + recorded + " 条", recorded + " recorded in total") + "</span></div>";
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
      var rows = (doc.opportunities || []).map(function (o) { return live(o, doc.rules || { min_days_to_deadline: 14 }); })
        .filter(Boolean)
        .sort(function (a, b) {
          var s = ORDER.indexOf(a.status) - ORDER.indexOf(b.status);
          if (s) return s;
          var da = a.days_left == null ? 1e6 : a.days_left, db = b.days_left == null ? 1e6 : b.days_left;
          return da - db || b.fit - a.fit;
        });
      data = { doc: doc, rows: rows };
      summary();
      render();
    })
    .catch(function () {
      document.getElementById("cards").innerHTML = '<div class="empty">' +
        biRaw("无法加载 data/grants.json。本地预览请用 <code>python3 -m http.server</code>。",
              "Could not load data/grants.json. To preview locally, serve the folder with <code>python3 -m http.server</code>.") + "</div>";
    });
})();
