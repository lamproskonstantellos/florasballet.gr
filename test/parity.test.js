"use strict";

// Byte-parity: the static build/ output must be byte-identical to what the live
// server.js serves for every route and feed — the core guarantee of the
// Cloudflare deploy. We render build/ fresh, boot the real server, normalize
// ONLY the per-deploy ?v= cache-buster on both sides, and assert equality.

const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const os = require("node:os");
const { start, stop, request } = require("./helper");
const { discoverArticleSlugs } = require("../server.js");
const { buildStatic } = require("../build-static.js");

// Render the parity build into a fresh OS temp dir (not the repo tree): the
// guarantee being proven is that the static bytes equal the served bytes, which
// is independent of the output location, and a unique temp dir keeps the test
// self-contained and side-effect-free.
const BUILD = path.join(os.tmpdir(), `florasballet-parity-${process.pid}`);

function stripVersion(s) {
  return String(s).replace(/\?v=[^"'&\s]*/g, "?v=V");
}

let base;
const SLUGS = discoverArticleSlugs();

before(async () => {
  buildStatic({ outDir: BUILD });
  ({ base } = await start());
});
after(async () => {
  await stop();
  try { fs.rmSync(BUILD, { recursive: true, force: true }); } catch { /* best-effort */ }
});

const HTML_ROUTES = [
  ["/", "index.html"],
  ["/i-scholi", "i-scholi/index.html"],
  ["/didaskontes", "didaskontes/index.html"],
  ["/diagonismoi", "diagonismoi/index.html"],
  ["/nea", "nea/index.html"],
  ...SLUGS.map((s) => [`/nea/${s}`, `nea/${s}/index.html`]),
];

for (const [routePath, buildRel] of HTML_ROUTES) {
  test(`byte-parity HTML: ${routePath}`, async () => {
    const res = await request(base, routePath);
    assert.equal(res.headers["content-type"], "text/html; charset=utf-8");
    const served = stripVersion(res.body.toString("utf8"));
    const built = stripVersion(fs.readFileSync(path.join(BUILD, buildRel), "utf8"));
    assert.strictEqual(built, served, `static build differs from server for ${routePath}`);
  });
}

test("byte-parity HTML: unknown route → 404.html", async () => {
  const res = await request(base, "/this-route-does-not-exist");
  assert.equal(res.status, 404);
  const served = stripVersion(res.body.toString("utf8"));
  const built = stripVersion(fs.readFileSync(path.join(BUILD, "404.html"), "utf8"));
  assert.strictEqual(built, served, "static 404.html differs from server not-found page");
});

const FEEDS = [
  ["/sitemap.xml", "sitemap.xml"],
  ["/rss.xml", "rss.xml"],
  ["/feed.json", "feed.json"],
];

for (const [routePath, buildRel] of FEEDS) {
  test(`byte-parity feed: ${routePath}`, async () => {
    const res = await request(base, routePath);
    assert.equal(res.status, 200);
    const served = res.body.toString("utf8");
    const built = fs.readFileSync(path.join(BUILD, buildRel), "utf8");
    assert.strictEqual(built, served, `static ${buildRel} differs from server`);
  });
}

test("build feed.json matches the committed golden", () => {
  const built = fs.readFileSync(path.join(BUILD, "feed.json"), "utf8");
  const golden = fs.readFileSync(path.join(__dirname, "golden", "feed.json"), "utf8");
  assert.strictEqual(built, golden);
});

test("no private/excluded file leaked into build/", () => {
  const mustBeAbsent = [
    "server.js", "build-static.js", "feeds.js",
    "package.json", "package-lock.json",
    ".gitignore", "LICENSE", "README.md", "news/README.md",
    "scripts", "test", "dist/manifest.json",
    "app.jsx", "icons.jsx", "components",
    "archive", "trash", "palette",
  ];
  for (const rel of mustBeAbsent) {
    assert.ok(!fs.existsSync(path.join(BUILD, rel)), `private file leaked into build/: ${rel}`);
  }
  for (const entry of fs.readdirSync(BUILD)) {
    assert.ok(!entry.startsWith("."), `dotfile leaked into build/: ${entry}`);
  }
});
