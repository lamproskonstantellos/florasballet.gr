# florasballet.gr

[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Deployed on Cloudflare Pages](https://img.shields.io/badge/deployed%20on-Cloudflare%20Pages-F38020?logo=cloudflarepages&logoColor=white)](https://pages.cloudflare.com/)
[![Live site](https://img.shields.io/badge/live-florasballet.gr-blue)](https://florasballet.gr/)

The website of **Σχολή Μπαλέτου Φλώρας Μουστάκη** (Flora's Ballet) — a state-recognized ballet school in Menidi (Acharnes), Greece, since 1986. A fast, minimal, Greek-only single-page application: home (hero carousel, courses, news, contact), the school, the teachers, the competition distinctions, and a news/announcements system.

## Stack

- **Frontend:** React 18 loaded via self-hosted UMD builds (`vendor/`). JSX is compiled to plain JavaScript at build time with [esbuild](https://esbuild.github.io/); no in-browser Babel. Plain CSS. Cormorant Garamond + Inter via Google Fonts.
- **Build / pre-render:** A dependency-free Node build step (`build-static.js`) pre-renders every route to a static `build/` directory: per-route `<title>` / meta / Open Graph / Twitter / canonical / JSON-LD, the auto-discovered per-article scripts, `sitemap.xml` / `rss.xml` / `feed.json`, a route-independent `404.html`, and the security-header + cache rules as Cloudflare `_headers` / `_redirects`. It reuses the same `renderHtml` and `feeds.js` builders as the local preview server, so the static output is byte-identical to what `server.js` serves (proven by `test/parity.test.js`). A per-deploy version query string on local CSS/JS busts browser caches on every deploy.
- **Local preview:** The dependency-free Node.js HTTP server (`server.js`, `npm start`) serves the same per-route meta and feeds at request time, with cached brotli/gzip compression, security headers + CSP (allowing Google Fonts and the Google Maps embed), class-appropriate `Cache-Control`, and malformed-request guards.
- **Images:** `scripts/optimize-images.js` (sharp) emits sibling `.webp` + `.avif` for every JPG/PNG under `images/` and `news/`, consumed by a `<Picture>` component (AVIF → WebP → original).
- **Hosting:** [Cloudflare Pages](https://pages.cloudflare.com/). Builds and deploys the static `build/` output on every git push.

## Local development

```bash
npm install
npm run build     # optimize images + compile JSX → dist/
npm start         # serve at http://localhost:3000
npm test          # run the test suite
```

While editing `.jsx` files, run `npm run watch` in a second terminal; esbuild rebuilds on every save.

## Static build

```bash
npm run build          # optimize images + compile JSX → dist/
npm run build:static   # pre-render every route → build/
```

`build-static.js` reuses the server's `renderHtml` and `feeds.js` builders, so every page, feed and header file in `build/` is byte-identical to what `server.js` serves (modulo the per-deploy `?v=` token), asserted by `test/parity.test.js`. Only an explicit allowlist of public assets is copied into `build/`; source, tooling, config, the design palette, the reference screenshots, the original masters and the content brief never are.

**Cloudflare Pages settings**

| Setting | Value |
|---------|-------|
| Build command | `npm run build && npm run build:static` |
| Build output directory | `build` |
| Environment variable | `NODE_VERSION=20` |

Add the custom domains `florasballet.gr` and `www.florasballet.gr` in the Pages project. Every `git push` builds and deploys.

## Project structure

```
.
├── app.jsx                Root component, router, header (dropdown + mobile menu), footer
├── components/            carousel, home, school, teachers, competitions, news, picture, shared (source)
├── icons.jsx              Inline SVG icon set (source)
├── site.config.js         Single source of truth for identity (dual Node/browser)
├── routes.js              Route table: parseRoute / routeToPath / isValidSpaRoute / pageTitle (dual)
├── article-schema.js      Article validation + newest-first comparator (dual)
├── ui-helpers.js          Share links + scroll-spy resolver (dual)
├── data.js                All Greek content: school, courses, teachers, competitions, why-us
├── styles.css             Global stylesheet (Flora's palette)
├── index.html             Single HTML entry with __META_*__ placeholders
├── feeds.js               sitemap.xml / rss.xml / feed.json builders (shared)
├── build-static.js        Pre-render every route to build/ for Cloudflare Pages
├── server.js              Local preview server
├── scripts/               optimize-images.js
├── vendor/                Self-hosted React 18 UMD builds
├── brand/ favicon/ images/  Brand logos, favicons, site photography
├── test/                  node:test suite + golden files
├── news/<slug>/           Per-article folders (article.js + cover + photos)
└── og-image.jpg           Social share image
```

Four modules load both in the browser (as `window` globals, before `data.js`) and in Node (via `require` from `server.js`): `site.config.js`, `routes.js`, `article-schema.js` and `ui-helpers.js`. Because both worlds share one definition, the client and server can never diverge on routes, titles, validation, sort order or identity.

## Editing content

All page copy lives in `data.js` and `site.config.js` — no need to touch the components.

- **Contact details, hours, address, phones, social links, map:** `site.config.js`.
- **Courses** (`Τα μαθήματα`): the `COURSES` array in `data.js` — `{ title, image, alt, desc }`. Add or reorder cards by editing the array; drop the photo in `images/courses/`.
- **The school page** (`/i-scholi`): the `SCHOOL` object in `data.js` (intro, history, philosophy, vision, goals).
- **Teachers** (`/didaskontes`): append a teacher object to the `TEACHERS` array in `data.js` and drop a portrait in `images/teachers/`; a new card renders automatically.
- **Competitions** (`/diagonismoi`): the `COMPETITIONS.years` array in `data.js` — `{ year, events: [{ name, results: [...] }] }`, newest year first.
- **Carousel slides:** the `carousel` array in `site.config.js` (drop slides in `images/carousel/`).

## Adding a news article

See [`news/README.md`](./news/README.md). In short: create a folder `news/<slug>/`, drop in `cover.jpg` and any photos, write `article.js`. The build auto-discovers it on the next deploy — no edits to `data.js` or `index.html`. (A slug is `[a-z0-9-]+`; folders starting with `_` or `.` are treated as drafts and never ship.)

## SEO

- Per-route `<title>`, `<meta description>`, Open Graph, Twitter Card, canonical and `og:locale="el_GR"` are pre-rendered into one static HTML file per route.
- The home page carries `DanceSchool` / `LocalBusiness` JSON-LD (address, phones, hours, founding year, social profiles), interior pages carry breadcrumbs, and article pages carry `Article` schema.
- `sitemap.xml`, `rss.xml` and `feed.json` are generated at build time; `robots.txt` points at the sitemap.

## Testing

```bash
npm run build && npm test
```

`node:test` (zero extra dependencies) boots the real `server.js` on an ephemeral port and checks served status/headers/meta, the feeds, security and hostile-input handling, cross-module consistency, SEO/accessibility and the image pipeline. A byte-parity suite renders the static build and asserts every route and feed is byte-identical to what `server.js` serves. Golden snapshots live in `test/golden/`; refresh a deliberate change with `UPDATE_GOLDEN=1 npm test`. CI runs the same `build` + `test` on every push.

## License

© 2026 Σχολή Μπαλέτου Φλώρας Μουστάκη (Flora Moustaki); website design and source code © 2026 Lampros Konstantellos. All rights reserved. The repository is public only to support building and deploying the site — public visibility grants no reuse rights. The source code and design are the work of Lampros Konstantellos; the written content, logos and photographs are the school's. The photographs depict the school's students, teachers and performances (some taken by third-party photographers and used with consent); many depict minors and may not be copied, redistributed or reused in any context without prior written permission. Third-party components keep their own licenses: React (MIT); Cormorant Garamond and Inter via Google Fonts (SIL Open Font License). See [`LICENSE`](./LICENSE) for the full terms. Permission requests: info@florasballet.gr.
