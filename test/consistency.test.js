"use strict";

// Cross-module consistency: every duplicated fact has one owner. These tests
// fail if a consumer drifts from its source of truth.

const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { start, stop, request } = require("./helper");

const ROOT = path.join(__dirname, "..");
const SITE = require("../site.config.js");
const routes = require("../routes.js");
const schema = require("../article-schema.js");
const server = require("../server.js");

let base;
before(async () => { ({ base } = await start()); });
after(async () => { await stop(); });

// ---- C1: route table agreement (parseRoute / computePageMeta / isValid) ----

test("parseRoute, computePageMeta and isValidSpaRoute agree on a corpus", () => {
  const corpus = [
    "/", "/i-scholi", "/didaskontes", "/diagonismoi", "/nea", "/epikoinonia",
    "/nea/enarxi-eggrafon-2026-2027",
    "/nea/unknown-slug-xyz",
    "/random", "/nea/", "/diagonismoi/", "/nea/a/b",
  ];
  for (const p of corpus) {
    const r = routes.parseRoute(p);
    const meta = server.computePageMeta(p);
    const valid = server.isValidSpaRoute(p);

    if (r.page === "home") {
      assert.equal(meta.ogType, "website");
      assert.equal(meta.title, SITE.name, `${p}: home title`);
      assert.equal(valid, true, `${p}: home valid`);
    } else if (["school", "teachers", "competitions", "news-list", "contact"].includes(r.page)) {
      assert.equal(meta.ogType, "website", p);
      assert.equal(valid, true, p);
    } else if (r.page === "article") {
      const isArticleMeta = meta.ogType === "article";
      assert.equal(isArticleMeta, valid, `${p}: article meta vs valid mismatch`);
    } else {
      assert.match(meta.title, /^Η σελίδα δεν βρέθηκε/, p);
      assert.equal(valid, false, p);
    }
  }
});

// ---- C2: a single newest-first comparator drives every ordered surface -----

test("feed.json and rss.xml share one newest-first order", async () => {
  const feed = JSON.parse((await request(base, "/feed.json")).body.toString("utf8"));
  const feedSlugs = feed.items.map((i) => i.url.split("/nea/")[1]);

  const rss = (await request(base, "/rss.xml")).body.toString("utf8");
  const rssSlugs = [...rss.matchAll(/\/nea\/([^<]+)<\/link>/g)].map((m) => m[1]);

  assert.deepEqual(feedSlugs, rssSlugs, "feed and rss order diverged");

  const dates = feed.items.map((i) => i.date_published);
  const sorted = [...dates].sort((a, b) => schema.compareByDateDesc({ date: a }, { date: b }));
  assert.deepEqual(dates, sorted, "feed order is not compareByDateDesc");
});

// ---- C4: site identity comes only from site.config.js ----------------------

test("index.html source hardcodes no site identity", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.ok(!html.includes(SITE.name), "index.html still hardcodes the site name");
});

test("served og:site_name / application-name come from SITE.name", async () => {
  const html = (await request(base, "/")).body.toString("utf8");
  assert.match(html, new RegExp(`<meta property="og:site_name" content="${SITE.name}"`));
  assert.match(html, new RegExp(`<meta name="application-name" content="${SITE.name}"`));
});

// ---- C5: LCP preload derived from the first carousel slide -----------------

test("home preload is the AVIF sibling of SITE.carousel[0]", async () => {
  const html = (await request(base, "/")).body.toString("utf8");
  const expected = SITE.carousel[0].replace(/\.(jpe?g|png)$/i, ".avif");
  assert.match(html, new RegExp(`<link rel="preload"[^>]*href="${expected}"`));
  assert.ok(fs.existsSync(path.join(ROOT, SITE.carousel[0].replace(/^\//, ""))));
});

// ---- C6: copyright year is derived, not hardcoded --------------------------

test("Footer derives the year (no hardcoded © 20xx)", () => {
  const appjsx = fs.readFileSync(path.join(ROOT, "app.jsx"), "utf8");
  assert.ok(!/©\s*20\d\d/.test(appjsx), "app.jsx still hardcodes a copyright year");
  assert.ok(appjsx.includes("getFullYear()"), "Footer should derive the year");
});

// ---- C7: social links come only from site.config.socialLinks ---------------

test("components reference SITE.socialLinks rather than hardcoded URLs", () => {
  const app = fs.readFileSync(path.join(ROOT, "app.jsx"), "utf8");
  const home = fs.readFileSync(path.join(ROOT, "components/home.jsx"), "utf8");
  assert.ok(app.includes("SITE.socialLinks"), "Footer must read SITE.socialLinks");
  assert.ok(home.includes("SITE.socialLinks"), "Contact must read SITE.socialLinks");
  const data = fs.readFileSync(path.join(ROOT, "data.js"), "utf8");
  assert.ok(!/facebook\.com|instagram\.com/.test(data), "data.js must not hardcode social URLs");
  assert.equal(SITE.socialLinks.length, 2, "exactly Facebook + Instagram");
});

// ---- C8: the folder name is the single owner of an article's slug ----------

test("every discovered article's folder name equals its slug field", () => {
  for (const slug of server.discoverArticleSlugs()) {
    const a = server.loadArticleMeta(slug);
    assert.ok(a, `${slug} failed to load`);
    assert.equal(a.slug, slug, `folder "${slug}" diverges from slug field "${a.slug}"`);
  }
});

// ---- C9: an article slug must be URL-safe (both worlds) --------------------

test("validateArticle rejects a slug with URL-unsafe characters", () => {
  const baseA = { date: "2026-01-01", dateLabel: "x", title: "t", excerpt: "e", body: ["b"] };
  for (const bad of ["a/b", "a b", "R&D", "a<b", "Upper"]) {
    assert.throws(() => schema.validateArticle({ ...baseA, slug: bad }), /invalid slug/, bad);
  }
  assert.doesNotThrow(() => schema.validateArticle({ ...baseA, slug: "enarxi-eggrafon-2026-2027" }));
});

// ---- C3: server and browser validate articles identically ------------------

test("validateArticle rejects the same invalid article in both worlds", () => {
  const bad = { slug: "x", date: "bad", dateLabel: "d", title: "t", excerpt: "e", body: ["b"] };
  assert.throws(() => schema.validateArticle(bad), /invalid date/);
});
