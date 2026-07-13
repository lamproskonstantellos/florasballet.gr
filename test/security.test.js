"use strict";

// Security & availability: hostile requests must get a clean status code and
// must never crash the process.

const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { start, stop, request, rawRequest } = require("./helper");

let base, port;
before(async () => { ({ base, port } = await start()); });
after(async () => { await stop(); });

// ---- invalid percent-encoding no longer crashes ----------------------------

test("invalid %-encoding returns 400 and keeps the server up", async () => {
  const bad = await request(base, "/%zz");
  assert.equal(bad.status, 400);
  const ok = await request(base, "/");
  assert.equal(ok.status, 200, "server must survive a bad-encoding request");
});

test("NUL byte (%00) returns 400, server survives", async () => {
  const res = await request(base, "/%00");
  assert.equal(res.status, 400);
  assert.equal((await request(base, "/")).status, 200);
});

// ---- malformed / missing Host no longer crashes ----------------------------

test("malformed Host header does not crash the server", async () => {
  const raw = await rawRequest(port, "GET / HTTP/1.1\r\nHost: a b\r\nConnection: close\r\n\r\n");
  assert.match(raw, /^HTTP\/1\.1 200/, "should answer 200 despite bad Host");
  assert.equal((await request(base, "/")).status, 200);
});

test("absent Host header still serves", async () => {
  const raw = await rawRequest(port, "GET / HTTP/1.0\r\n\r\n");
  assert.match(raw, /^HTTP\/1\.[01] 200/);
});

// ---- Method policy ----------------------------------------------------------

test("method policy: GET/HEAD ok, OPTIONS 204, others 405", async () => {
  assert.equal((await request(base, "/", { method: "GET" })).status, 200);

  const head = await request(base, "/", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0, "HEAD must not send a body");

  const opt = await request(base, "/", { method: "OPTIONS" });
  assert.equal(opt.status, 204);
  assert.equal(opt.headers["allow"], "GET, HEAD, OPTIONS");

  for (const m of ["POST", "PUT", "DELETE", "PATCH"]) {
    const res = await request(base, "/", { method: m });
    assert.equal(res.status, 405, `${m} should be 405`);
    assert.equal(res.headers["allow"], "GET, HEAD, OPTIONS");
  }
});

// ---- Path traversal corpus --------------------------------------------------

test("traversal attempts never disclose files outside the site", async () => {
  const corpus = [
    "/../server.js",
    "/../../etc/passwd",
    "/%2e%2e%2f%2e%2e%2fetc%2fpasswd",
    "/..%2f..%2fserver.js",
    "/news/../../server.js",
    "/.git/config",
    "/%2e%2e/%2e%2e/package.json",
  ];
  for (const p of corpus) {
    const res = await request(base, p);
    assert.ok([400, 403, 404].includes(res.status), `${p} -> ${res.status} (must be blocked)`);
    assert.ok(!res.body.toString("utf8").includes("PUBLIC_DIR"), `${p} leaked server.js`);
    assert.ok(!res.body.toString("utf8").includes("root:x:0:0"), `${p} leaked /etc/passwd`);
  }
});

test("sibling-directory prefix cannot escape the public root", async () => {
  const res = await request(base, "/..%2fflorasballet-secrets%2fx");
  assert.ok([400, 403, 404].includes(res.status));
});

// Encoded single-dot ("/%2e%2f" -> "/./") normalizes to a private file inside
// the root. It passes the traversal check (never escapes the root) so the
// private-path guard must run on the NORMALIZED path, not the raw one.
test("encoded './' cannot disclose private source files", async () => {
  const corpus = [
    "/%2e%2fserver.js",
    "/%2e%2ffeeds.js",
    "/%2e%2fbuild-static.js",
    "/%2e%2fpackage.json",
    "/%2e%2fREADME.md",
    "/%2e%2fdist%2fmanifest.json",
    "/%2e%2ftest%2fsecurity.test.js",
    "/%2e%2f%2e%2fserver.js",
  ];
  for (const p of corpus) {
    const res = await request(base, p);
    assert.equal(res.status, 404, `${p} must be blocked (private-path bypass)`);
    const body = res.body.toString("utf8");
    assert.ok(!body.includes("PUBLIC_DIR"), `${p} leaked server.js source`);
    assert.ok(!body.includes("require("), `${p} leaked JS source`);
  }
});

// ---- Oversized / odd inputs -------------------------------------------------

test("very long URL does not crash", async () => {
  const res = await request(base, "/" + "a".repeat(10000));
  assert.equal(res.status, 404);
  assert.equal((await request(base, "/")).status, 200);
});

// ---- $-pattern injection through article-like meta -------------------------
test("served HTML has exactly one <title> and no leftover placeholder", async () => {
  const html = (await request(base, "/")).body.toString("utf8");
  assert.equal((html.match(/<title>/g) || []).length, 1);
  assert.ok(!html.includes("__META_"), "no unreplaced meta placeholder");
});

// ---- Compression negotiation safety ----------------------------------------

test("HEAD with brotli sets encoding but sends no body", async () => {
  const res = await request(base, "/styles.css", {
    method: "HEAD",
    headers: { "Accept-Encoding": "br" },
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers["content-encoding"], "br");
  assert.equal(res.body.length, 0);
});

// ---- CSP allows the site's external dependencies (fonts + maps) -------------

test("CSP allows Google Fonts and the Google Maps iframe", async () => {
  const res = await request(base, "/");
  const csp = res.headers["content-security-policy"];
  assert.match(csp, /style-src[^;]*fonts\.googleapis\.com/, "fonts stylesheet host");
  assert.match(csp, /font-src[^;]*fonts\.gstatic\.com/, "fonts files host");
  assert.match(csp, /frame-src[^;]*www\.google\.com/, "maps iframe host");
  assert.match(csp, /script-src 'self'/, "no third-party scripts allowed");
});
