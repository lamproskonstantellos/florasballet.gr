"use strict";

// Performance & build pipeline: every image the <Picture> component renders has
// its built AVIF/WebP siblings, compression is correct, and the LCP preload is
// the real asset.

const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { start, stop, request } = require("./helper");
const SITE = require("../site.config.js");

const ROOT = path.join(__dirname, "..");
let base;
before(async () => { ({ base } = await start()); });
after(async () => { await stop(); });

// Every JPG/PNG under the <Picture>-served directories (images/, news/).
function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(jpe?g|png)$/i.test(e.name)) yield p;
  }
}

test("every Picture-served JPG/PNG has built .avif and .webp siblings", () => {
  const missing = [];
  for (const dir of ["images", "news"]) {
    for (const src of walk(path.join(ROOT, dir))) {
      const baseNoExt = src.replace(/\.(jpe?g|png)$/i, "");
      for (const ext of [".avif", ".webp"]) {
        if (!fs.existsSync(baseNoExt + ext)) missing.push(path.relative(ROOT, baseNoExt + ext));
      }
    }
  }
  assert.deepEqual(missing, [], `missing optimized siblings: ${missing.join(", ")}`);
});

test("preloaded hero (first carousel slide) is a real, smaller AVIF (LCP win)", () => {
  const jpgRel = SITE.carousel[0].replace(/^\//, "");
  const avif = path.join(ROOT, jpgRel.replace(/\.(jpe?g|png)$/i, ".avif"));
  const jpg = path.join(ROOT, jpgRel);
  assert.ok(fs.existsSync(avif), "hero AVIF missing");
  const buf = fs.readFileSync(avif);
  assert.equal(buf.slice(4, 12).toString("latin1"), "ftypavif", "not a valid AVIF");
  assert.ok(buf.length < fs.statSync(jpg).size, "AVIF should be smaller than the JPG");
});

test("AVIF is served as image/avif (not octet-stream under nosniff)", async () => {
  const avifPath = "/" + SITE.carousel[0].replace(/^\//, "").replace(/\.(jpe?g|png)$/i, ".avif");
  const res = await request(base, avifPath);
  assert.equal(res.status, 200, `${avifPath} should exist after build`);
  assert.equal(res.headers["content-type"], "image/avif");
});

test("the generated feeds are compressed and round-trip (rss, feed.json)", async () => {
  for (const p of ["/rss.xml", "/feed.json"]) {
    const identity = await request(base, p);
    const br = await request(base, p, { headers: { "Accept-Encoding": "br" } });
    assert.equal(br.headers["content-encoding"], "br", `${p} not brotli-compressed`);
    assert.equal(br.headers["vary"], "Accept-Encoding", `${p} missing Vary`);
    assert.ok(br.body.length < identity.body.length, `${p} compressed not smaller`);
    assert.ok(
      zlib.brotliDecompressSync(br.body).equals(identity.body),
      `${p} brotli payload does not round-trip`
    );
    assert.equal(identity.headers["content-encoding"], undefined, `${p} identity has an encoding`);
  }
});

test("brotli and gzip responses round-trip to the original bytes", async () => {
  const original = fs.readFileSync(path.join(ROOT, "styles.css"));
  const br = await request(base, "/styles.css", { headers: { "Accept-Encoding": "br" } });
  assert.equal(br.headers["content-encoding"], "br");
  assert.ok(zlib.brotliDecompressSync(br.body).equals(original), "brotli payload corrupt");

  const gz = await request(base, "/styles.css", { headers: { "Accept-Encoding": "gzip" } });
  assert.equal(gz.headers["content-encoding"], "gzip");
  assert.ok(zlib.gunzipSync(gz.body).equals(original), "gzip payload corrupt");
});

test("compression is cached: repeated requests return identical Content-Length", async () => {
  const a = await request(base, "/styles.css", { headers: { "Accept-Encoding": "br" } });
  const b = await request(base, "/styles.css", { headers: { "Accept-Encoding": "br" } });
  assert.equal(a.headers["content-length"], b.headers["content-length"]);
  assert.ok(a.body.equals(b.body), "cached compressed bytes differ");
});

test("dist bundles do not embed React (kept external via window globals)", () => {
  const manifest = require("../dist/manifest.json");
  for (const [out, info] of Object.entries(manifest.outputs)) {
    if (!info.entryPoint) continue;
    const code = fs.readFileSync(path.join(ROOT, out), "utf8");
    assert.ok(!code.includes("react.production.min"), `${out} appears to embed React`);
    assert.ok(code.length < 50000, `${out} unexpectedly large (${code.length}b)`);
  }
});

test("optimize-images is idempotent and tolerates per-image failure", () => {
  const src = fs.readFileSync(path.join(ROOT, "scripts/optimize-images.js"), "utf8");
  assert.ok(/mtimeMs\s*>=\s*srcMtime/.test(src), "missing freshness/idempotence check");
  assert.ok(/catch\s*\(e\)\s*\{[\s\S]*console\.error/.test(src), "per-image failure not caught");
});
