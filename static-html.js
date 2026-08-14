/* ============================================================
   static-html.js — pre-rendered body content for every route
   ------------------------------------------------------------
   Generates semantic, crawler-readable HTML for the #root
   container from the SAME sources the React app renders
   (data.js, site.config.js, the discovered articles), so search
   engines and AI crawlers that do not execute JavaScript (GPTBot,
   ClaudeBot, PerplexityBot, CCBot, Bing's non-rendering fetches)
   see the full page content and every internal link — and a
   visitor without JavaScript gets a working, navigable site.

   The React app boots afterwards and replaces this content with
   the interactive tree (ReactDOM render() clears the container),
   so the static markup mirrors the app's structure and reuses its
   CSS classes; image URLs point at the same .avif variants the
   <Picture> component loads, so nothing is fetched twice.

   Node-only (require), like feeds.js / server.js.
   ============================================================ */

"use strict";

const fs = require("fs");
const path = require("path");

// Local copy of server.js's escapeHtml (no require cycle), byte-identical.
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Escape, then honour the site's inline **bold** marker (matches the client's
// renderInline in components/shared.jsx).
function inline(text) {
  return escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

// Site-root path for an asset, preferring the .avif sibling the <Picture>
// component will load anyway — same URL, so the browser cache is shared and
// nothing downloads twice once the app boots.
function avif(assetPath) {
  const p = assetPath.startsWith("/") ? assetPath : "/" + assetPath;
  return p.replace(/\.(jpe?g|png)$/i, ".avif");
}

// Evaluate data.js (a browser-global file) with a fake window, exactly like
// server.js does for article.js files, and return the content globals.
function loadContentData(rootDir) {
  const code = fs.readFileSync(path.join(rootDir, "data.js"), "utf8");
  const fakeWindow = {};
  new Function("window", code)(fakeWindow);
  return {
    WHY_US: fakeWindow.WHY_US || [],
    COURSES: fakeWindow.COURSES || [],
    SCHOOL: fakeWindow.SCHOOL || {},
    TEACHERS: fakeWindow.TEACHERS || [],
    COMPETITIONS: fakeWindow.COMPETITIONS || { intro: "", years: [] },
    LIMITS: fakeWindow.LIMITS || { newsPreview: 3 },
  };
}

/* ---- shared building blocks ---- */

function navHtml() {
  return (
    `<nav aria-label="Κύρια πλοήγηση">` +
    `<a href="/">Αρχική</a> · ` +
    `<a href="/i-scholi">Η Σχολή</a> · ` +
    `<a href="/didaskontes">Διδάσκοντες</a> · ` +
    `<a href="/#mathimata">Μαθήματα</a> · ` +
    `<a href="/diagonismoi">Διαγωνισμοί</a> · ` +
    `<a href="/nea">Νέα &amp; Ανακοινώσεις</a> · ` +
    `<a href="/epikoinonia">Επικοινωνία</a>` +
    `</nav>`
  );
}

function headerHtml(siteCfg) {
  return (
    `<header class="site-header"><div class="site-header-inner">` +
    `<a class="brand" href="/"><img class="brand-logo" src="${escapeHtml(siteCfg.logoNav)}" alt="${escapeHtml(siteCfg.name)}" width="550" height="270" /></a>` +
    navHtml() +
    `</div></header>`
  );
}

function contactBlockHtml(siteCfg) {
  const phones = siteCfg.phones
    .map((p) => `<a href="tel:${escapeHtml(p.tel)}">${escapeHtml(p.display)}</a>`)
    .join(" · ");
  const hours = siteCfg.hours
    .map((h) => `${escapeHtml(h.label)} ${escapeHtml(h.time)}`)
    .join(" · ");
  return (
    `<p><strong>Διεύθυνση:</strong> <a href="${escapeHtml(siteCfg.mapsLink)}">${escapeHtml(siteCfg.address.street)}, ${escapeHtml(siteCfg.address.postalCode)} ${escapeHtml(siteCfg.address.area)}</a></p>` +
    `<p><strong>Τηλέφωνα:</strong> ${phones}</p>` +
    `<p><strong>Email:</strong> <a href="mailto:${escapeHtml(siteCfg.email)}">${escapeHtml(siteCfg.email)}</a></p>` +
    `<p><strong>Ώρες λειτουργίας:</strong> ${hours}</p>`
  );
}

function footerHtml(siteCfg) {
  const [fb, ig] = siteCfg.socialLinks;
  return (
    `<footer class="site-footer"><div class="site-footer-inner"><div class="footer-col">` +
    `<p>Αναγνωρισμένη από το κράτος σχολή μπαλέτου στο Μενίδι, από το ${escapeHtml(siteCfg.founded)}.</p>` +
    contactBlockHtml(siteCfg) +
    `<p><a href="${escapeHtml(fb)}">Facebook</a> · <a href="${escapeHtml(ig)}">Instagram</a></p>` +
    `</div></div></footer>`
  );
}

function articleCardHtml(a) {
  return (
    `<article class="static-news-item">` +
    `<h3><a href="/nea/${escapeHtml(a.slug)}">${escapeHtml(a.title)}</a></h3>` +
    `<p><time datetime="${escapeHtml(a.date)}">${escapeHtml(a.dateLabel)}</time>${a.location ? " — " + escapeHtml(a.location) : ""}</p>` +
    `<p>${escapeHtml(a.excerpt)}</p>` +
    `</article>`
  );
}

/* ---- per-route main content ---- */

function homeMain(data, siteCfg, articles) {
  const hero = siteCfg.carousel[0];
  const preview = articles.slice(0, data.LIMITS.newsPreview);
  return (
    `<div class="page">` +
    `<img src="${escapeHtml(avif(hero))}" alt="Φωτογραφία από παράσταση της σχολής" width="1600" height="900" style="max-width:100%;height:auto" />` +
    `<div class="home-intro">` +
    `<p class="home-eyebrow">40 χρόνια ρυθμός, κίνηση &amp; αγάπη για τον χορό</p>` +
    `<h1>${escapeHtml(data.SCHOOL.h1 || siteCfg.name)}</h1>` +
    `<p class="sub">${escapeHtml(data.SCHOOL.h1Sub || "")}</p>` +
    `</div>` +
    `<section id="giati-emas"><h2>Γιατί εμάς</h2><ol>` +
    data.WHY_US.map((t) => `<li>${inline(t)}</li>`).join("") +
    `</ol></section>` +
    `<section id="mathimata"><h2>Τα μαθήματα</h2>` +
    data.COURSES.map((c) =>
      `<article><h3>${escapeHtml(c.title)}</h3>` +
      `<img src="${escapeHtml(avif(c.image))}" alt="${escapeHtml(c.alt)}" width="1400" height="875" style="max-width:100%;height:auto" />` +
      `<p>${inline(c.desc)}</p></article>`
    ).join("") +
    `</section>` +
    `<section id="nea"><h2>Νέα &amp; Ανακοινώσεις</h2>` +
    preview.map(articleCardHtml).join("") +
    `<p><a href="/nea">Όλα τα νέα</a></p>` +
    `</section>` +
    `</div>`
  );
}

function schoolMain(data) {
  const s = data.SCHOOL;
  return (
    `<div class="page school-page">` +
    `<header class="page-head"><h1>Εμείς</h1></header>` +
    `<p class="school-lead">${inline(s.intro || "")}</p>` +
    `<section class="school-block"><h2>Ιστορία</h2><div class="prose">` +
    (s.history || []).map((p) => `<p>${inline(p)}</p>`).join("") +
    `</div></section>` +
    `<section class="school-block"><h2>Φιλοσοφία</h2><div class="prose"><p>${inline(s.philosophy || "")}</p></div></section>` +
    `<section class="school-block"><h2>Όραμα</h2><div class="prose"><p>${inline(s.vision || "")}</p></div></section>` +
    `<section class="school-block"><h2>Στόχοι</h2>` +
    (s.goals || []).map((g) => `<h3>${escapeHtml(g.title)}</h3><p>${inline(g.text)}</p>`).join("") +
    `</section>` +
    `</div>`
  );
}

function teachersMain(data) {
  return (
    `<div class="page teachers-page">` +
    `<header class="page-head"><h1>Διδάσκοντες</h1></header>` +
    data.TEACHERS.map((t) =>
      `<article class="teacher-card"><div>` +
      `<h2>${escapeHtml(t.name)}</h2>` +
      `<p>${escapeHtml(t.role)}</p>` +
      `<img src="${escapeHtml(avif(t.image))}" alt="${escapeHtml(t.alt)}" width="1072" height="1500" style="max-width:360px;height:auto" />` +
      (t.bio || []).map((p) => `<p>${inline(p)}</p>`).join("") +
      (t.highlights && t.highlights.length
        ? `<h3>${escapeHtml(t.highlightsTitle || "Διακρίσεις")}</h3><ul>` +
          t.highlights.map((h) => `<li><strong>${escapeHtml(h.label)}:</strong> ${inline(h.text)}</li>`).join("") +
          `</ul>`
        : "") +
      `</div></article>`
    ).join("") +
    `</div>`
  );
}

function competitionsMain(data) {
  const c = data.COMPETITIONS;
  return (
    `<div class="page comp-page">` +
    `<header class="page-head"><h1>Διαγωνισμοί</h1></header>` +
    `<p class="comp-intro">${escapeHtml(c.intro || "")}</p>` +
    (c.years || []).map((y) =>
      `<section><h2>${escapeHtml(y.year)}</h2>` +
      y.events.map((ev) =>
        `<h3>${escapeHtml(ev.name)}</h3><ul>` +
        ev.results.map((r) => `<li>${escapeHtml(r)}</li>`).join("") +
        `</ul>`
      ).join("") +
      `</section>`
    ).join("") +
    `</div>`
  );
}

function newsListMain(articles) {
  return (
    `<div class="page list-page">` +
    `<header class="page-head"><h1>Νέα &amp; Ανακοινώσεις</h1></header>` +
    (articles.length
      ? articles.map(articleCardHtml).join("")
      : `<p class="list-empty">Δεν υπάρχουν ακόμη ανακοινώσεις.</p>`) +
    `</div>`
  );
}

function articleMain(article) {
  return (
    `<div class="page article">` +
    `<p><a href="/nea">← Νέα &amp; Ανακοινώσεις</a></p>` +
    `<p class="article-meta"><time datetime="${escapeHtml(article.date)}">${escapeHtml(article.dateLabel)}</time>${article.location ? " — " + escapeHtml(article.location) : ""}</p>` +
    `<h1>${escapeHtml(article.title)}</h1>` +
    (article.cover
      ? `<img src="${escapeHtml(avif(article.cover))}" alt="" width="1280" height="720" style="max-width:100%;height:auto" />`
      : "") +
    `<div class="article-body">` +
    (article.body || []).map((p) => `<p>${inline(p)}</p>`).join("") +
    `</div>` +
    (article.photos && article.photos.length
      ? `<div class="article-gallery-static">` +
        article.photos.map((ph, i) => {
          const src = typeof ph === "string" ? ph : ph.src;
          const alt = (typeof ph === "object" && ph.alt) || `Φωτογραφία ${i + 1} από «${article.title}»`;
          return `<img src="${escapeHtml(avif(src))}" alt="${escapeHtml(alt)}" width="800" height="600" loading="lazy" style="max-width:100%;height:auto" />`;
        }).join("") +
        `</div>`
      : "") +
    `</div>`
  );
}

function contactMain(siteCfg) {
  return (
    `<div class="page contact-page">` +
    `<h1>Επικοινωνία</h1>` +
    contactBlockHtml(siteCfg) +
    `</div>`
  );
}

function notFoundMain() {
  return (
    `<div class="page notfound">` +
    `<h1>Η σελίδα δεν βρέθηκε</h1>` +
    `<p class="notfound-sub">Η σελίδα μπορεί να μετακινήθηκε ή να μην υπήρξε ποτέ.</p>` +
    `<p><a href="/">Αρχική</a> · <a href="/nea">Νέα</a> · <a href="/epikoinonia">Επικοινωνία</a></p>` +
    `</div>`
  );
}

/* ---- entry point ---- */

// route: the parseRoute() result; articles: validated meta, newest first.
function renderStaticBody(route, { data, siteCfg, articles }) {
  let main;
  switch (route.page) {
    case "home": main = homeMain(data, siteCfg, articles); break;
    case "school": main = schoolMain(data); break;
    case "teachers": main = teachersMain(data); break;
    case "competitions": main = competitionsMain(data); break;
    case "news-list": main = newsListMain(articles); break;
    case "article": {
      const article = articles.find((a) => a.slug === route.slug);
      main = article ? articleMain(article) : notFoundMain();
      break;
    }
    case "contact": main = contactMain(siteCfg); break;
    default: main = notFoundMain();
  }
  return (
    headerHtml(siteCfg) +
    `<main id="main-content">` + main + `</main>` +
    footerHtml(siteCfg)
  );
}

module.exports = { renderStaticBody, loadContentData };
