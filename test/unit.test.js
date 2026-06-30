"use strict";

// Unit tests for pure helpers and the shared route table.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const {
  escapeHtml,
  jsonLdScript,
  cacheHeaderFor,
  isValidSpaRoute,
  computePageMeta,
} = require("../server.js");
const SITE = require("../site.config.js");
const routes = require("../routes.js");

const ARTICLE = "enarxi-eggrafon-2026-2027";

// ---- escapeHtml -------------------------------------------------------------

test("escapeHtml escapes the five HTML-significant characters", () => {
  assert.equal(escapeHtml(`<a href="x" title='y'>&</a>`),
    "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
});

test("escapeHtml leaves $ unescaped (root of the replace-pattern hazard)", () => {
  assert.equal(escapeHtml("price $5 and $$"), "price $5 and $$");
  assert.equal(escapeHtml("$`"), "$`");
  assert.equal(escapeHtml("$&"), "$&amp;");
  assert.equal(escapeHtml("$'"), "$&#39;");
});

// ---- jsonLdScript -----------------------------------------------------------

test("jsonLdScript escapes < to prevent </script> breakout", () => {
  const out = jsonLdScript({ x: "</script><b>" });
  assert.ok(!out.includes("</script>"));
  assert.ok(out.includes("\\u003c/script"));
});

// ---- cacheHeaderFor ---------------------------------------------------------

test("cacheHeaderFor classes", () => {
  const req = (url) => ({ url, headers: { host: "example.com" } });
  assert.match(cacheHeaderFor(req("/"), "text/html; charset=utf-8"), /no-store/);
  assert.match(cacheHeaderFor(req("/dist/app-X.js"), "application/javascript"), /immutable/);
  assert.match(cacheHeaderFor(req("/styles.css?v=1"), "text/css"), /immutable/);
  assert.match(cacheHeaderFor(req("/styles.css"), "text/css"), /max-age=86400/);
});

// ---- isValidSpaRoute --------------------------------------------------------

test("isValidSpaRoute corpus", () => {
  assert.equal(isValidSpaRoute("/"), true);
  assert.equal(isValidSpaRoute("/i-scholi"), true);
  assert.equal(isValidSpaRoute("/didaskontes"), true);
  assert.equal(isValidSpaRoute("/diagonismoi"), true);
  assert.equal(isValidSpaRoute("/nea"), true);
  assert.equal(isValidSpaRoute(`/nea/${ARTICLE}`), true);
  assert.equal(isValidSpaRoute("/nea/"), true); // trailing slash normalized
  assert.equal(isValidSpaRoute("/nea/nope"), false);
  assert.equal(isValidSpaRoute("/random"), false);
  assert.equal(isValidSpaRoute("/nea/a/b"), false);
});

// ---- computePageMeta route table -------------------------------------------

test("computePageMeta home", () => {
  const m = computePageMeta("/");
  assert.equal(m.ogType, "website");
  assert.equal(m.title, SITE.name, "home title is just the school name");
  assert.ok(m.jsonLd, "home has JSON-LD");
  assert.equal(m.url, "https://florasballet.gr/");
  // The home graph is a DanceSchool / LocalBusiness.
  const types = m.jsonLd["@graph"].map((n) => n["@type"]);
  assert.ok(types.some((t) => Array.isArray(t) ? t.includes("DanceSchool") : t === "DanceSchool"));
});

test("computePageMeta static interior pages", () => {
  for (const [p, label] of [
    ["/i-scholi", "Η Σχολή"],
    ["/didaskontes", "Διδάσκοντες"],
    ["/diagonismoi", "Διαγωνισμοί"],
    ["/nea", "Νέα & Ανακοινώσεις"],
  ]) {
    const m = computePageMeta(p);
    assert.equal(m.ogType, "website");
    assert.ok(m.title.startsWith(label), `${p}: title starts with "${label}"`);
    const bc = m.jsonLd["@graph"].find((n) => n["@type"] === "BreadcrumbList");
    assert.ok(bc, `${p}: has a breadcrumb`);
  }
});

test("computePageMeta article", () => {
  const m = computePageMeta(`/nea/${ARTICLE}`);
  assert.equal(m.ogType, "article");
  const graph = m.jsonLd["@graph"];
  const article = graph.find((n) => n["@type"] === "Article");
  assert.equal(article.headline, "Έναρξη εγγραφών για τη χρονιά 2026–2027");
  assert.equal(article.inLanguage, "el");
  assert.ok(article.wordCount > 0);
});

test("computePageMeta unknown route → not-found meta", () => {
  const m = computePageMeta("/nope");
  assert.match(m.title, /^Η σελίδα δεν βρέθηκε/);
  assert.equal(m.jsonLd, null);
});

// ---- defineArticle validation (data.js via window shim) --------------------

function loadDataWindow() {
  const code = fs.readFileSync(path.join(__dirname, "../data.js"), "utf8");
  const schema = require("../article-schema.js");
  const window = {
    SITE: require("../site.config.js"),
    validateArticle: schema.validateArticle,
    compareByDateDesc: schema.compareByDateDesc,
  };
  // eslint-disable-next-line no-new-func
  new Function("window", code)(window);
  return window;
}

const validArticle = () => ({
  slug: "x",
  date: "2026-01-02",
  dateLabel: "2 Ιανουαρίου 2026",
  title: "T",
  excerpt: "E",
  body: ["one"],
});

test("defineArticle accepts a valid article", () => {
  const { defineArticle } = loadDataWindow();
  assert.doesNotThrow(() => defineArticle(validArticle()));
});

test("defineArticle rejects missing required fields", () => {
  const { defineArticle } = loadDataWindow();
  for (const f of ["slug", "date", "dateLabel", "title", "excerpt", "body"]) {
    const a = validArticle();
    delete a[f];
    assert.throws(() => defineArticle(a), new RegExp(f), `should reject missing ${f}`);
  }
});

test("defineArticle rejects bad date format", () => {
  const { defineArticle } = loadDataWindow();
  const a = validArticle();
  a.date = "2026/01/02";
  assert.throws(() => defineArticle(a), /invalid date/);
});

test("defineArticle rejects non-array body / photos / keywords / topics", () => {
  const { defineArticle } = loadDataWindow();
  const bad = (mut) => { const a = validArticle(); mut(a); return a; };
  assert.throws(() => defineArticle(bad((a) => (a.body = "no"))), /empty or non-array body/);
  assert.throws(() => defineArticle(bad((a) => (a.photos = "no"))), /non-array photos/);
  assert.throws(() => defineArticle(bad((a) => (a.keywords = "no"))), /non-array keywords/);
  assert.throws(() => defineArticle(bad((a) => (a.topics = "no"))), /non-array topics/);
});

// ---- shared route table (routes.js, used by client AND server) -------------

test("parseRoute corpus", () => {
  assert.deepEqual(routes.parseRoute("/"), { page: "home", section: null });
  assert.deepEqual(routes.parseRoute(""), { page: "home", section: null });
  assert.deepEqual(routes.parseRoute("/i-scholi"), { page: "school" });
  assert.deepEqual(routes.parseRoute("/didaskontes"), { page: "teachers" });
  assert.deepEqual(routes.parseRoute("/diagonismoi"), { page: "competitions" });
  assert.deepEqual(routes.parseRoute("/nea"), { page: "news-list" });
  assert.deepEqual(routes.parseRoute("/nea/"), { page: "news-list" });
  assert.deepEqual(routes.parseRoute("/nea/some-slug"), { page: "article", slug: "some-slug" });
  assert.deepEqual(routes.parseRoute("/nea/a/b"), { page: "not-found" });
  assert.deepEqual(routes.parseRoute("/random"), { page: "not-found" });
});

test("routeToPath corpus (inverse of parseRoute)", () => {
  assert.equal(routes.routeToPath({ page: "home" }), "/");
  assert.equal(routes.routeToPath({ page: "school" }), "/i-scholi");
  assert.equal(routes.routeToPath({ page: "teachers" }), "/didaskontes");
  assert.equal(routes.routeToPath({ page: "competitions" }), "/diagonismoi");
  assert.equal(routes.routeToPath({ page: "news-list" }), "/nea");
  assert.equal(routes.routeToPath({ page: "article", slug: "s" }), "/nea/s");
  assert.equal(routes.routeToPath({ page: "home", section: "mathimata" }), "/#mathimata");
  assert.equal(routes.routeToPath(null), "/");
});

test("isValidSpaRoute respects known slugs", () => {
  const known = ["a", "b"];
  assert.equal(routes.isValidSpaRoute("/nea/a", known), true);
  assert.equal(routes.isValidSpaRoute("/nea/c", known), false);
  assert.equal(routes.isValidSpaRoute("/nea/a", undefined), true); // client: any slug
  assert.equal(routes.isValidSpaRoute("/random", known), false);
});
