/* ============================================================
   feeds.js — single source of truth for the generated feeds
   ------------------------------------------------------------
   Pure builders for sitemap.xml, rss.xml and feed.json, shared
   by the live server (server.js, request time) and the static
   build (build-static.js, build time) so the two outputs can
   never drift. Each builder takes the already-loaded, validated
   article meta objects plus the site config and returns the
   EXACT response body string the server serves.

   Node-only (require), like server.js — never loaded in the
   browser. Depends only on the dual article-schema module.
   ============================================================ */

"use strict";

const { compareByDateDesc } = require("./article-schema.js");

// Local copy of server.js's escapeHtml so this module stays self-contained
// (no require cycle with server.js). Deliberately byte-identical to that one.
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// The fixed (article-independent) pages, in sitemap order.
const STATIC_PATHS = ["/", "/i-scholi", "/didaskontes", "/diagonismoi", "/nea", "/epikoinonia"];

// The only fixed pages whose content actually changes when a news item is
// published: the home page (news preview) and the news index. The other static
// pages (school, teachers, competitions, contact) do not, so stamping them with
// the newest article date is a false signal Google may learn to distrust — they
// omit <lastmod> instead (it is optional).
const NEWS_DRIVEN_PATHS = new Set(["/", "/nea"]);

// sitemap.xml — the static pages, then one <url> per article in folder order.
// News-driven index pages carry the most-recent article date as their lastmod;
// the rest omit it. Image extension entries point Google Images at the hero
// photography (home) and each article's cover.
function buildSitemap({ articles, siteCfg }) {
  const list = Array.isArray(articles) ? articles : [];

  const articleDates = list
    .map((a) => a && a.date)
    .filter((d) => d && ISO_DATE.test(d))
    .sort()
    .reverse();
  const latestContentDate = articleDates[0] || "2026-01-01";

  const entries = STATIC_PATHS.map((p) => ({
    path: p,
    lastmod: NEWS_DRIVEN_PATHS.has(p) ? latestContentDate : null,
    images: p === "/"
      ? [siteCfg.defaultImage, ...(siteCfg.carousel || [])].map((img) => `${siteCfg.url}${img}`)
      : [],
  }));

  for (const a of list) {
    entries.push({
      path: `/nea/${a.slug}`,
      lastmod: a && ISO_DATE.test(a.date) ? a.date : latestContentDate,
      images: a.cover ? [`${siteCfg.url}/${a.cover}`] : [],
    });
  }

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
    entries
      .map((e) =>
        `  <url>\n    <loc>${siteCfg.url}${e.path}</loc>` +
        (e.lastmod ? `\n    <lastmod>${e.lastmod}</lastmod>` : "") +
        e.images.map((img) => `\n    <image:image>\n      <image:loc>${img}</image:loc>\n    </image:image>`).join("") +
        `\n  </url>`)
      .join("\n") +
    `\n</urlset>\n`
  );
}

// rss.xml — RSS 2.0 channel, newest-first items built from the articles.
function buildRss({ articles, siteCfg }) {
  const items = (Array.isArray(articles) ? articles : [])
    .filter((a) => a && a.date)
    .sort(compareByDateDesc);

  const itemXml = items
    .map((a) => {
      const link = `${siteCfg.url}/nea/${a.slug}`;
      const pubDate = new Date(`${a.date}T00:00:00Z`).toUTCString();
      return (
        `  <item>\n` +
        `    <title>${escapeHtml(a.title)}</title>\n` +
        `    <link>${link}</link>\n` +
        `    <guid isPermaLink="true">${link}</guid>\n` +
        `    <pubDate>${pubDate}</pubDate>\n` +
        `    <description>${escapeHtml(a.excerpt || "")}</description>\n` +
        `  </item>`
      );
    })
    .join("\n");

  // Deterministic even with zero items: wall-clock time would make the feed
  // body differ per request/build and turn the byte-parity guarantee into a
  // clock race. Falls back to the same fixed epoch the sitemap uses.
  const lastBuildDate = new Date(
    `${items.length ? items[0].date : "2026-01-01"}T00:00:00Z`
  ).toUTCString();

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n` +
    `<channel>\n` +
    `  <title>${escapeHtml(siteCfg.name)} – Νέα</title>\n` +
    `  <link>${siteCfg.url}/nea</link>\n` +
    `  <description>${escapeHtml(siteCfg.defaultDescription)}</description>\n` +
    `  <language>el</language>\n` +
    `  <lastBuildDate>${lastBuildDate}</lastBuildDate>\n` +
    `  <atom:link href="${siteCfg.url}/rss.xml" rel="self" type="application/rss+xml" />\n` +
    (itemXml ? itemXml + `\n` : "") +
    `</channel>\n` +
    `</rss>\n`
  );
}

// feed.json — JSON Feed 1.1, newest-first, pretty-printed (2-space).
function buildFeed({ articles, siteCfg }) {
  const items = (Array.isArray(articles) ? articles : [])
    .filter((a) => a && a.date)
    .sort(compareByDateDesc);

  const feed = {
    version: "https://jsonfeed.org/version/1.1",
    title: `${siteCfg.name} – Νέα`,
    home_page_url: `${siteCfg.url}/nea`,
    feed_url: `${siteCfg.url}/feed.json`,
    description: siteCfg.defaultDescription,
    language: "el",
    authors: [
      { name: siteCfg.name, url: siteCfg.url }
    ],
    items: items.map((a) => {
      const url = `${siteCfg.url}/nea/${a.slug}`;
      const item = {
        id: url,
        url,
        title: a.title,
        // Strip the inline **bold** markers: content_text is plain text by the
        // JSON Feed spec, and the browser renders ** as <strong>, so the markers
        // must not leak to feed subscribers.
        content_text: Array.isArray(a.body)
          ? a.body.join("\n\n").replace(/\*\*([^*]+)\*\*/g, "$1")
          : "",
        summary: a.excerpt || "",
        date_published: new Date(`${a.date}T00:00:00Z`).toISOString(),
      };
      if (a.cover) item.image = `${siteCfg.url}/${a.cover}`;
      if (a.keywords && a.keywords.length) item.tags = a.keywords;
      return item;
    }),
  };

  return JSON.stringify(feed, null, 2);
}

// llms.txt — the llmstxt.org convention: a Markdown site summary served at
// /llms.txt so AI assistants and answer engines get the essentials (identity,
// contact details, page map, courses, latest news) in one plain-text fetch,
// without parsing HTML. Built from the same site config / content data as
// everything else so it can never drift.
function buildLlmsTxt({ articles, siteCfg, data }) {
  const items = (Array.isArray(articles) ? articles : [])
    .filter((a) => a && a.date)
    .sort(compareByDateDesc);

  const lines = [
    `# ${siteCfg.name} (${siteCfg.shortName})`,
    ``,
    `> ${siteCfg.defaultDescription}`,
    ``,
    `- Διεύθυνση: ${siteCfg.address.street}, ${siteCfg.address.postalCode} ${siteCfg.address.area}, ${siteCfg.address.region}, Ελλάδα`,
    `- Τηλέφωνα: ${siteCfg.phones.map((p) => p.display).join(", ")}`,
    `- Email: ${siteCfg.email}`,
    `- Ώρες λειτουργίας: ${siteCfg.hours.map((h) => `${h.label} ${h.time}`).join(" · ")}`,
    `- Έτος ίδρυσης: ${siteCfg.founded}`,
    `- Ιστότοπος: ${siteCfg.url}/`,
    `- Χάρτης: ${siteCfg.mapsLink}`,
    ``,
    `## Σελίδες`,
    ``,
    `- [Αρχική](${siteCfg.url}/): Παρουσίαση της σχολής, μαθήματα και νέα`,
    `- [Η Σχολή](${siteCfg.url}/i-scholi): Ταυτότητα, ιστορία, φιλοσοφία, όραμα και στόχοι`,
    `- [Διδάσκοντες](${siteCfg.url}/didaskontes): Οι δάσκαλοι της σχολής`,
    `- [Διαγωνισμοί](${siteCfg.url}/diagonismoi): Βραβεύσεις και διακρίσεις ανά χρονιά`,
    `- [Νέα & Ανακοινώσεις](${siteCfg.url}/nea): Όλες οι ανακοινώσεις`,
    `- [Επικοινωνία](${siteCfg.url}/epikoinonia): Τηλέφωνα, διεύθυνση, ώρες και χάρτης`,
    ``,
  ];

  if (data && Array.isArray(data.COURSES) && data.COURSES.length) {
    lines.push(`## Μαθήματα`, ``);
    for (const c of data.COURSES) {
      lines.push(`- ${c.title}: ${c.desc}`);
    }
    lines.push(``);
  }

  if (items.length) {
    lines.push(`## Νέα`, ``);
    for (const a of items) {
      lines.push(`- [${a.title}](${siteCfg.url}/nea/${a.slug}) (${a.date}): ${a.excerpt}`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}

module.exports = { buildSitemap, buildRss, buildFeed, buildLlmsTxt };
