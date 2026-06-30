"use strict";

// Unit tests for ui-helpers.js — the pure logic behind the article share row
// (shareLinks) and the homepage scroll-spy nav (pickActiveSection). The module
// follows the dual Node/browser pattern of routes.js, so it is exercised here
// directly via require, with no JSX compilation involved.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { shareLinks, pickActiveSection } = require("../ui-helpers.js");

// ---- shareLinks --------------------------------------------------------------

test("shareLinks builds the Facebook sharer URL with the target encoded", () => {
  const url = "https://florasballet.gr/nea/some-slug";
  assert.deepEqual(shareLinks(url), {
    facebook:
      "https://www.facebook.com/sharer/sharer.php?u=" +
      "https%3A%2F%2Fflorasballet.gr%2Fnea%2Fsome-slug",
  });
});

test("shareLinks percent-encodes every URL-significant character", () => {
  const { facebook } = shareLinks("https://x.com/a?b=c&d=e#f");
  const encoded = facebook.split("?u=")[1];
  assert.equal(encoded, "https%3A%2F%2Fx.com%2Fa%3Fb%3Dc%26d%3De%23f");
  assert.ok(!encoded.includes("&"));
  assert.ok(!encoded.includes("#"));
  assert.equal(decodeURIComponent(encoded), "https://x.com/a?b=c&d=e#f");
});

// ---- pickActiveSection -------------------------------------------------------

const IDS = ["giati-emas", "mathimata", "nea", "epikoinonia"];
const e = (id, ratio, top) => ({ id, ratio, top });

test("pickActiveSection: null above the first section (carousel/intro in view)", () => {
  const entries = [
    e("giati-emas", 0, 320),
    e("mathimata", 0, 900),
    e("nea", 0, 1500),
    e("epikoinonia", 0, 2100),
  ];
  assert.equal(pickActiveSection(entries, IDS), null);
});

test("pickActiveSection: the single section crossing the band wins", () => {
  const entries = [
    e("giati-emas", 0, -700),
    e("mathimata", 0.04, -120),
    e("nea", 0, 480),
    e("epikoinonia", 0, 1100),
  ];
  assert.equal(pickActiveSection(entries, IDS), "mathimata");
});

test("pickActiveSection: when two sections straddle the band, the later one wins", () => {
  const entries = [
    e("giati-emas", 0.02, -800),
    e("mathimata", 0.01, 12),
    e("nea", 0, 700),
  ];
  assert.equal(pickActiveSection(entries, IDS), "mathimata");
});

test("pickActiveSection: nothing crossing → last section whose top passed the band", () => {
  const entries = [
    e("giati-emas", 0, -2400),
    e("mathimata", 0, -1700),
    e("nea", 0, -900),
    e("epikoinonia", 0, -300),
  ];
  assert.equal(pickActiveSection(entries, IDS), "epikoinonia");
});

test("pickActiveSection: entry order does not matter, ids order does", () => {
  const entries = [
    e("epikoinonia", 0, 1100),
    e("mathimata", 0.04, -10),
    e("giati-emas", 0, -600),
    e("nea", 0, 480),
  ];
  assert.equal(pickActiveSection(entries, IDS), "mathimata");
});

test("pickActiveSection: tolerates missing entries and empty input", () => {
  assert.equal(pickActiveSection([], IDS), null);
  assert.equal(pickActiveSection([e("nea", 0.5, -4)], IDS), "nea");
  assert.equal(pickActiveSection(undefined, IDS), null);
});

// ---- browser wiring ----------------------------------------------------------

test("index.html loads ui-helpers.js after article-schema.js and before data.js", () => {
  const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  const schema = html.indexOf('<script src="/article-schema.js"></script>');
  const helpers = html.indexOf('<script src="/ui-helpers.js"></script>');
  const data = html.indexOf('<script src="/data.js"></script>');
  assert.ok(schema !== -1 && helpers !== -1 && data !== -1, "all three script tags present");
  assert.ok(schema < helpers && helpers < data, "ui-helpers.js must load between them");
});

test("ui-helpers.js assigns its API to window in the browser", () => {
  const src = fs.readFileSync(path.join(__dirname, "../ui-helpers.js"), "utf8");
  assert.match(src, /Object\.assign\(window,\s*api\)/);
});
