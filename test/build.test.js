"use strict";

// Build determinism: esbuild content hashing must be stable for identical
// inputs, so a redeploy without source changes does not churn asset URLs.

const { test } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const esbuild = require("esbuild");

const ROOT = path.join(__dirname, "..");
const ENTRY = [
  "app.jsx",
  "icons.jsx",
  "components/shared.jsx",
  "components/picture.jsx",
  "components/carousel.jsx",
  "components/home.jsx",
  "components/school.jsx",
  "components/teachers.jsx",
  "components/competitions.jsx",
  "components/news.jsx",
];

async function buildNames() {
  const result = await esbuild.build({
    absWorkingDir: ROOT,
    entryPoints: ENTRY,
    outdir: "dist-determinism-check",
    entryNames: "[dir]/[name]-[hash]",
    loader: { ".jsx": "jsx" },
    jsx: "transform",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    target: "es2020",
    minify: true,
    metafile: true,
    write: false,
  });
  return Object.keys(result.metafile.outputs).sort();
}

test("two esbuild runs produce identical hashed output names", async () => {
  const a = await buildNames();
  const b = await buildNames();
  assert.deepEqual(a, b);
  assert.equal(a.length, ENTRY.length, "one output per entry point");
  for (const name of a) {
    assert.match(name, /-[A-Z0-9]{8}\.js$/, `expected content hash in ${name}`);
  }
});
