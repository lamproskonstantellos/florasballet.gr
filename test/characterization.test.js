"use strict";

// Golden characterization of the served output. These lock behaviour that must
// not change accidentally; a deliberate change is refreshed with UPDATE_GOLDEN=1.

const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { start, stop, request, normalizeHtml, matchGolden } = require("./helper");

let base;
before(async () => { ({ base } = await start()); });
after(async () => { await stop(); });

// ---- Full normalized HTML per route ----------------------------------------

const HTML_ROUTES = [
  ["/", "home.html"],
  ["/i-scholi", "school.html"],
  ["/didaskontes", "teachers.html"],
  ["/diagonismoi", "competitions.html"],
  ["/nea", "news.html"],
  ["/nea/enarxi-eggrafon-2026-2027", "article.html"],
  ["/this-route-does-not-exist", "notfound.html"],
];

for (const [routePath, golden] of HTML_ROUTES) {
  test(`HTML golden: ${routePath}`, async () => {
    const res = await request(base, routePath);
    assert.equal(res.headers["content-type"], "text/html; charset=utf-8");
    matchGolden(golden, normalizeHtml(res.body.toString("utf8")));
  });
}

// ---- Status codes -----------------------------------------------------------

test("status codes per route", async () => {
  const checks = [
    ["/", 200],
    ["/i-scholi", 200],
    ["/didaskontes", 200],
    ["/diagonismoi", 200],
    ["/nea", 200],
    ["/epikoinonia", 200],
    ["/nea/enarxi-eggrafon-2026-2027", 200],
    ["/nea/does-not-exist", 404],
    ["/totally-unknown", 404],
    ["/missing-asset.js", 404],
  ];
  for (const [p, expected] of checks) {
    const res = await request(base, p);
    assert.equal(res.status, expected, `${p} expected ${expected}, got ${res.status}`);
  }
});

// ---- Title per route --------------------------------------------------------

test("title per route", async () => {
  const titleOf = (b) => (b.toString("utf8").match(/<title>([^<]*)<\/title>/) || [])[1];
  assert.equal(titleOf((await request(base, "/")).body),
    "Σχολή Μπαλέτου Φλώρας Μουστάκη");
  assert.equal(titleOf((await request(base, "/i-scholi")).body), "Η Σχολή – Σχολή Μπαλέτου Φλώρας Μουστάκη");
  assert.equal(titleOf((await request(base, "/didaskontes")).body), "Διδάσκοντες – Σχολή Μπαλέτου Φλώρας Μουστάκη");
  assert.equal(titleOf((await request(base, "/diagonismoi")).body), "Διαγωνισμοί – Σχολή Μπαλέτου Φλώρας Μουστάκη");
  assert.equal(titleOf((await request(base, "/nea")).body), "Νέα &amp; Ανακοινώσεις – Σχολή Μπαλέτου Φλώρας Μουστάκη");
  assert.equal(titleOf((await request(base, "/epikoinonia")).body), "Επικοινωνία – Σχολή Μπαλέτου Φλώρας Μουστάκη");
});

// ---- Feeds (deterministic) --------------------------------------------------

test("sitemap.xml golden", async () => {
  const res = await request(base, "/sitemap.xml");
  assert.equal(res.status, 200);
  assert.equal(res.headers["content-type"], "application/xml; charset=utf-8");
  matchGolden("sitemap.xml", res.body.toString("utf8"));
});

test("rss.xml golden", async () => {
  const res = await request(base, "/rss.xml");
  assert.equal(res.status, 200);
  assert.equal(res.headers["content-type"], "application/rss+xml; charset=utf-8");
  matchGolden("rss.xml", res.body.toString("utf8"));
});

test("feed.json golden", async () => {
  const res = await request(base, "/feed.json");
  assert.equal(res.status, 200);
  assert.equal(res.headers["content-type"], "application/feed+json; charset=utf-8");
  matchGolden("feed.json", res.body.toString("utf8"));
});

// ---- Asset MIME + cache classes --------------------------------------------

test("asset content types and cache classes", async () => {
  const css = await request(base, "/styles.css");
  assert.equal(css.headers["content-type"], "text/css; charset=utf-8");
  assert.match(css.headers["cache-control"], /public, max-age=86400/);

  const ico = await request(base, "/favicon/favicon.ico");
  assert.equal(ico.headers["content-type"], "image/x-icon");

  const mani = await request(base, "/site.webmanifest");
  assert.equal(mani.headers["content-type"], "application/manifest+json");

  const html = (await request(base, "/")).body.toString("utf8");
  const distRef = html.match(/\/dist\/app-[A-Z0-9]{8}\.js/);
  assert.ok(distRef, "expected a hashed app bundle reference in HTML");
  const appJs = await request(base, distRef[0]);
  assert.equal(appJs.status, 200);
  assert.match(appJs.headers["cache-control"], /immutable/);

  const vcss = await request(base, "/styles.css?v=abc123");
  assert.match(vcss.headers["cache-control"], /immutable/);

  const home = await request(base, "/");
  assert.match(home.headers["cache-control"], /no-store/);
});

// ---- Security headers -------------------------------------------------------

test("security header set", async () => {
  const res = await request(base, "/");
  const picked = {};
  for (const k of [
    "x-content-type-options",
    "referrer-policy",
    "x-frame-options",
    "strict-transport-security",
    "permissions-policy",
    "cross-origin-opener-policy",
    "content-security-policy",
  ]) {
    picked[k] = res.headers[k];
  }
  matchGolden("security-headers.json", JSON.stringify(picked, null, 2) + "\n");
});

// ---- Compression negotiation + Vary ----------------------------------------

test("brotli negotiation sets Content-Encoding + Vary", async () => {
  const res = await request(base, "/styles.css", { headers: { "Accept-Encoding": "br" } });
  assert.equal(res.headers["content-encoding"], "br");
  assert.equal(res.headers["vary"], "Accept-Encoding");
});

test("gzip negotiation sets Content-Encoding + Vary", async () => {
  const res = await request(base, "/styles.css", { headers: { "Accept-Encoding": "gzip" } });
  assert.equal(res.headers["content-encoding"], "gzip");
  assert.equal(res.headers["vary"], "Accept-Encoding");
});

test("no Accept-Encoding → identity, no Vary surprise", async () => {
  const res = await request(base, "/styles.css", { headers: { "Accept-Encoding": "" } });
  assert.equal(res.headers["content-encoding"], undefined);
});

// ---- Private paths return 404 ----------------------------------------------

test("private paths are not served", async () => {
  for (const p of [
    "/server.js",
    "/build-static.js",
    "/feeds.js",
    "/package.json",
    "/LICENSE",
    "/.gitignore",
    "/archive/PROMPT.md",
    "/dist/manifest.json",
    "/scripts/optimize-images.js",
    "/.git/config",
    "/README.md",
    "/news/README.md",
    "/test/helper.js",
    "/test/golden/home.html",
    "/_reference/ref-home-carousel.png",
    "/palette/colors.css",
    "/PROMPT.md",
    "/Florasballet-Domi-Periexomenou_LK.docx",
  ]) {
    const res = await request(base, p);
    assert.equal(res.status, 404, `${p} should be 404, got ${res.status}`);
  }
});

// ---- Intended-public files still served ------------------------------------

test("intended-public files are served", async () => {
  for (const p of [
    "/site.config.js",
    "/ui-helpers.js",
    "/data.js",
    "/robots.txt",
    "/site.webmanifest",
    "/favicon/favicon.svg",
    "/news/enarxi-eggrafon-2026-2027/article.js",
  ]) {
    const res = await request(base, p);
    assert.equal(res.status, 200, `${p} should be 200, got ${res.status}`);
  }
});

// ---- HEAD requests ----------------------------------------------------------

test("HEAD request on home", async () => {
  const res = await request(base, "/", { method: "HEAD" });
  assert.ok([200, 404].includes(res.status));
});
