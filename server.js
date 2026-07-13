const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const { URL } = require("url");
const SITE_CFG = require("./site.config.js");
const { parseRoute, isValidSpaRoute: routeIsValidSpa, pageTitle } = require("./routes.js");
const { validateArticle } = require("./article-schema.js");
const { buildSitemap, buildRss, buildFeed } = require("./feeds.js");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

// Unique per server start - forces browser to re-fetch JS/CSS on every deploy.
// The static build (build-static.js) stamps its own version from
// CF_PAGES_COMMIT_SHA; the same commit SHA is honoured here if present, falling
// back to the boot timestamp for local dev.
const DEPLOY_VERSION = process.env.CF_PAGES_COMMIT_SHA
  ? process.env.CF_PAGES_COMMIT_SHA.slice(0, 12)
  : Date.now();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".jsx": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
};

// Scan news/ for subfolders containing an article.js, returning sorted slugs.
function discoverArticleSlugs() {
  const newsDir = path.join(PUBLIC_DIR, "news");
  let entries;
  try { entries = fs.readdirSync(newsDir, { withFileTypes: true }); }
  catch { return []; }
  return entries
    // Skip draft/hidden/temp folders (names starting with "_" or ".") so an
    // in-progress or scratch folder never ships into routing, feeds or sitemap.
    .filter((d) => d.isDirectory() && !d.name.startsWith("_") && !d.name.startsWith("."))
    .filter((d) => fs.existsSync(path.join(newsDir, d.name, "article.js")))
    .map((d) => d.name)
    .sort();
}

// Read the esbuild metafile and map logical entry names → hashed output paths.
function loadAssetMap() {
  const manifestPath = path.join(PUBLIC_DIR, "dist", "manifest.json");
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const map = {};
    for (const [outputPath, info] of Object.entries(manifest.outputs || {})) {
      if (!info.entryPoint) continue;
      // entryPoint: "app.jsx" → key "app"
      // entryPoint: "components/news.jsx" → key "components/news"
      const key = info.entryPoint.replace(/\.jsx$/, "");
      map[key] = "/" + outputPath.replace(/\\/g, "/");
    }
    return map;
  } catch {
    return {};
  }
}

// Read an image's pixel dimensions from its header bytes — PNG IHDR or JPEG SOF
// marker — with no external dependency. Used to declare accurate
// og:image:width/height per route. Returns { width, height } or null.
function imageDims(absPath) {
  let buf;
  try { buf = fs.readFileSync(absPath); } catch { return null; }
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xff) { i++; continue; }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      if (len < 2) return null;
      i += 2 + len;
    }
  }
  return null;
}

// Short content hash of an image file, appended to its og:image URL as a ?v=
// cache-buster so social scrapers / CDNs re-fetch a same-name replacement.
function imageVersion(absPath) {
  try {
    return crypto.createHash("sha1").update(fs.readFileSync(absPath)).digest("hex").slice(0, 12);
  } catch {
    return null;
  }
}

const DEFAULT_IMAGE_PATH = path.join(PUBLIC_DIR, SITE_CFG.defaultImage.replace(/^\//, ""));
const DEFAULT_IMAGE_VERSION = imageVersion(DEFAULT_IMAGE_PATH);
const DEFAULT_IMAGE = `${SITE_CFG.url}${SITE_CFG.defaultImage}${DEFAULT_IMAGE_VERSION ? `?v=${DEFAULT_IMAGE_VERSION}` : ""}`;
const DEFAULT_IMAGE_DIMS = imageDims(DEFAULT_IMAGE_PATH);
const DEFAULT_DESCRIPTION = SITE_CFG.defaultDescription;
// The first carousel slide is the LCP image; preload the AVIF sibling the
// <picture> will pick. Derived from SITE_CFG.carousel[0] so the preload can
// never point at a renamed/missing file.
const HERO_PRELOAD_IMAGE = SITE_CFG.carousel[0].replace(/\.(jpe?g|png)$/i, ".avif");

// Home identity graph: a DanceSchool / LocalBusiness built entirely from
// site.config so the structured data can never drift from the contact section.
const SCHOOL_JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "name": SITE_CFG.name,
      "url": SITE_CFG.url,
      "inLanguage": "el",
    },
    {
      "@type": ["DanceSchool", "LocalBusiness"],
      "name": SITE_CFG.name,
      "alternateName": SITE_CFG.shortName,
      "url": SITE_CFG.url,
      "image": DEFAULT_IMAGE,
      "logo": `${SITE_CFG.url}${SITE_CFG.logoOnWhite}`,
      "description": DEFAULT_DESCRIPTION,
      "email": SITE_CFG.email,
      "telephone": SITE_CFG.phones.map((p) => p.tel),
      "foundingDate": SITE_CFG.founded,
      "address": {
        "@type": "PostalAddress",
        "streetAddress": SITE_CFG.address.street,
        "addressLocality": SITE_CFG.address.locality,
        "addressRegion": SITE_CFG.address.region,
        "postalCode": SITE_CFG.address.postalCode,
        "addressCountry": SITE_CFG.address.country,
      },
      "geo": {
        "@type": "GeoCoordinates",
        "latitude": SITE_CFG.geo.lat,
        "longitude": SITE_CFG.geo.lng,
      },
      "hasMap": `https://www.google.com/maps?q=${SITE_CFG.geo.lat},${SITE_CFG.geo.lng}`,
      "areaServed": "Αχαρνές, Αττική",
      "openingHours": SITE_CFG.hours.map((h) => h.schema),
      "sameAs": SITE_CFG.socialLinks,
    },
  ],
};

// A BreadcrumbList graph for a static interior page.
function breadcrumbJsonLd(label, urlPath) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Αρχική", "item": SITE_CFG.url },
          { "@type": "ListItem", "position": 2, "name": label, "item": `${SITE_CFG.url}${urlPath}` },
        ],
      },
    ],
  };
}

// Execute a single article.js to extract its metadata. NOT a security sandbox:
// article.js files are first-party content (the trust boundary is the repo).
// The captured article is run through the SAME validateArticle the browser uses.
function loadArticleMeta(slug) {
  const file = path.join(PUBLIC_DIR, "news", slug, "article.js");
  if (!fs.existsSync(file)) return null;
  try {
    const code = fs.readFileSync(file, "utf8");
    let captured = null;
    const capture = (article) => { captured = article; };
    const fakeWindow = {
      NEWS_ARTICLES: { push: capture },
      defineArticle: capture,
      validateArticle,
    };
    new Function("window", "defineArticle", code)(fakeWindow, capture);
    if (captured) {
      validateArticle(captured);
      // The folder name is the single owner of the slug. If the article's own
      // slug field disagrees, the canonical/feed URLs would point at a path the
      // server cannot route — reject the divergence instead of shipping it.
      if (captured.slug !== slug) {
        throw new Error(
          `folder "${slug}" does not match article slug "${captured.slug}"`
        );
      }
    }
    return captured;
  } catch (e) {
    console.error(`Skipping article "${slug}" — ${e.message}`);
    return null;
  }
}

// Serialize JSON-LD for embedding inside <script type="application/ld+json">.
function jsonLdScript(obj) {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// Built once at startup (article folders / asset map only change between deploys).
const ARTICLE_SLUGS = discoverArticleSlugs();
const ARTICLE_META = {};
const ARTICLE_COVER_DIMS = {};
const ARTICLE_COVER_VERSION = {};
for (const slug of ARTICLE_SLUGS) {
  const meta = loadArticleMeta(slug);
  ARTICLE_META[slug] = meta;
  if (meta && meta.cover) {
    ARTICLE_COVER_DIMS[slug] = imageDims(path.join(PUBLIC_DIR, meta.cover));
    ARTICLE_COVER_VERSION[slug] = imageVersion(path.join(PUBLIC_DIR, meta.cover));
  }
}
const ARTICLES = ARTICLE_SLUGS.map((slug) => ARTICLE_META[slug]).filter(Boolean);
const ARTICLE_SCRIPTS = ARTICLE_SLUGS
  .map((slug) => `<script src="/news/${slug}/article.js"></script>`)
  .join("\n");
const ASSET_MAP = loadAssetMap();

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Static interior pages: label + description + breadcrumb, keyed by route.page.
const STATIC_PAGES = {
  school: {
    path: "/i-scholi",
    label: "Η Σχολή",
    description:
      "Η ταυτότητα, η ιστορία, η φιλοσοφία, το όραμα και οι στόχοι της Σχολής Μπαλέτου Φλώρας Μουστάκη. Σχολή στο Μενίδι, αναγνωρισμένη από το κράτος από το 1986.",
  },
  teachers: {
    path: "/didaskontes",
    label: "Διδάσκοντες",
    description:
      "Οι διδάσκοντες της Σχολής Μπαλέτου Φλώρας Μουστάκη. Γνωρίστε την ομάδα που εμπνέει και διδάσκει κάθε μαθητή.",
  },
  competitions: {
    path: "/diagonismoi",
    label: "Διαγωνισμοί",
    description:
      "Διακρίσεις και βραβεύσεις των μαθητών μας σε εθνικούς και διεθνείς διαγωνισμούς χορού, ανά χρονιά.",
  },
  "news-list": {
    path: "/nea",
    label: "Νέα & Ανακοινώσεις",
    description:
      "Νέα και ανακοινώσεις από τη Σχολή Μπαλέτου Φλώρας Μουστάκη: εγγραφές, παραστάσεις και συμμετοχές σε διαγωνισμούς.",
  },
  contact: {
    path: "/epikoinonia",
    label: "Επικοινωνία",
    description:
      "Επικοινωνήστε με τη Σχολή Μπαλέτου Φλώρας Μουστάκη: τηλέφωνα, email, ώρες λειτουργίας, διεύθυνση στο Μενίδι (Αχαρνές) και χάρτης.",
  },
};

function computePageMeta(pathname) {
  const route = parseRoute(pathname);
  const titleCtx = { siteName: SITE_CFG.name, tagline: SITE_CFG.tagline };

  if (route.page === "home") {
    return {
      title: pageTitle(route, titleCtx),
      description: DEFAULT_DESCRIPTION,
      url: `${SITE_CFG.url}/`,
      image: DEFAULT_IMAGE,
      imageWidth: DEFAULT_IMAGE_DIMS && DEFAULT_IMAGE_DIMS.width,
      imageHeight: DEFAULT_IMAGE_DIMS && DEFAULT_IMAGE_DIMS.height,
      imageAlt: SITE_CFG.name,
      ogType: "website",
      jsonLd: SCHOOL_JSONLD,
      preloadImage: HERO_PRELOAD_IMAGE,
    };
  }

  const stat = STATIC_PAGES[route.page];
  if (stat) {
    return {
      title: pageTitle(route, titleCtx),
      description: stat.description,
      url: `${SITE_CFG.url}${stat.path}`,
      image: DEFAULT_IMAGE,
      imageWidth: DEFAULT_IMAGE_DIMS && DEFAULT_IMAGE_DIMS.width,
      imageHeight: DEFAULT_IMAGE_DIMS && DEFAULT_IMAGE_DIMS.height,
      imageAlt: SITE_CFG.name,
      ogType: "website",
      jsonLd: breadcrumbJsonLd(stat.label, stat.path),
    };
  }

  if (route.page === "article") {
    const article = ARTICLE_META[route.slug];
    if (article) {
      const coverVersion = ARTICLE_COVER_VERSION[route.slug];
      const image = article.cover
        ? `${SITE_CFG.url}/${article.cover}${coverVersion ? `?v=${coverVersion}` : ""}`
        : DEFAULT_IMAGE;
      const imageDimensions = article.cover ? ARTICLE_COVER_DIMS[route.slug] : DEFAULT_IMAGE_DIMS;

      const articleBody = Array.isArray(article.body) ? article.body.join("\n\n") : "";
      const wordCount = articleBody ? articleBody.trim().split(/\s+/).length : 0;

      const articleSchema = {
        "@type": "Article",
        "headline": article.title,
        "description": article.excerpt,
        "image": image,
        "datePublished": article.date,
        "dateModified": article.date,
        "author": { "@type": "Organization", "name": SITE_CFG.name, "url": SITE_CFG.url },
        "publisher": {
          "@type": "Organization",
          "name": SITE_CFG.name,
          "url": SITE_CFG.url,
          "logo": { "@type": "ImageObject", "url": `${SITE_CFG.url}${SITE_CFG.logoOnWhite}` },
        },
        "mainEntityOfPage": `${SITE_CFG.url}/nea/${article.slug}`,
        "articleBody": articleBody,
        "wordCount": wordCount,
        "inLanguage": "el",
      };
      if (article.keywords && article.keywords.length) {
        articleSchema.keywords = article.keywords.join(", ");
      }
      if (article.articleSection) {
        articleSchema.articleSection = article.articleSection;
      }

      const breadcrumbs = {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Αρχική", "item": SITE_CFG.url },
          { "@type": "ListItem", "position": 2, "name": "Νέα & Ανακοινώσεις", "item": `${SITE_CFG.url}/nea` },
          { "@type": "ListItem", "position": 3, "name": article.title, "item": `${SITE_CFG.url}/nea/${article.slug}` },
        ],
      };

      return {
        title: pageTitle(route, { ...titleCtx, articleTitle: article.title }),
        description: article.excerpt,
        url: `${SITE_CFG.url}/nea/${article.slug}`,
        image,
        imageWidth: imageDimensions && imageDimensions.width,
        imageHeight: imageDimensions && imageDimensions.height,
        imageAlt: article.title,
        ogType: "article",
        jsonLd: {
          "@context": "https://schema.org",
          "@graph": [breadcrumbs, articleSchema],
        },
      };
    }
  }

  // Unknown route — served to the SPA NotFound page with HTTP 404. Canonical /
  // og:url point at home rather than reflecting the requested pathname.
  return {
    title: pageTitle(route, titleCtx),
    description: DEFAULT_DESCRIPTION,
    url: `${SITE_CFG.url}/`,
    image: DEFAULT_IMAGE,
    imageWidth: DEFAULT_IMAGE_DIMS && DEFAULT_IMAGE_DIMS.width,
    imageHeight: DEFAULT_IMAGE_DIMS && DEFAULT_IMAGE_DIMS.height,
    imageAlt: SITE_CFG.name,
    ogType: "website",
    jsonLd: null,
  };
}

function parseRequestUrl(req) {
  return new URL(req.url || "/", "http://localhost");
}

function cacheHeaderFor(req, contentType) {
  if (contentType.startsWith("text/html")) {
    return "no-cache, no-store, must-revalidate";
  }
  let url;
  try {
    url = parseRequestUrl(req);
  } catch {
    return "public, max-age=86400";
  }
  if (url.searchParams.has("v") || url.pathname.startsWith("/dist/")) {
    return "public, max-age=31536000, immutable";
  }
  return "public, max-age=86400";
}

function isCompressible(contentType) {
  return (
    /^text\//.test(contentType) ||
    /^image\/svg/.test(contentType) ||
    /^application\/(javascript|json|xml|xhtml\+xml)(;|$)/.test(contentType) ||
    /^application\/[\w.+-]+\+(json|xml)(;|$)/.test(contentType)
  );
}

const BROTLI_QUALITY = 6;
const COMPRESSION_CACHE = new Map();
const COMPRESSION_CACHE_MAX = 128;

function getCompressed(cacheKey, encoding, data) {
  let entry = cacheKey ? COMPRESSION_CACHE.get(cacheKey) : null;
  if (entry && entry[encoding]) return entry[encoding];

  const out =
    encoding === "br"
      ? zlib.brotliCompressSync(data, {
          params: { [zlib.constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY },
        })
      : zlib.gzipSync(data);

  if (cacheKey) {
    if (!entry) {
      if (COMPRESSION_CACHE.size >= COMPRESSION_CACHE_MAX) {
        COMPRESSION_CACHE.delete(COMPRESSION_CACHE.keys().next().value);
      }
      entry = {};
      COMPRESSION_CACHE.set(cacheKey, entry);
    }
    entry[encoding] = out;
  }
  return out;
}

function writeCompressed(req, res, headers, data, cacheKey) {
  const status = headers.__status || 200;
  delete headers.__status;
  const isHead = req.method === "HEAD";
  const accept = req.headers["accept-encoding"] || "";
  const ct = headers["Content-Type"] || "";

  const buf = data == null ? Buffer.alloc(0) : Buffer.isBuffer(data) ? data : Buffer.from(data);

  let encoding = null;
  if (isCompressible(ct) && buf.length > 1024) {
    if (/\bbr\b/.test(accept)) encoding = "br";
    else if (/\bgzip\b/.test(accept)) encoding = "gzip";
  }

  if (encoding) {
    let compressed;
    try {
      compressed = getCompressed(cacheKey, encoding, buf);
    } catch {
      compressed = null;
    }
    if (compressed) {
      res.writeHead(status, {
        ...headers,
        "Content-Encoding": encoding,
        "Content-Length": compressed.length,
        "Vary": "Accept-Encoding",
      });
      res.end(isHead ? undefined : compressed);
      return;
    }
  }

  res.writeHead(status, { ...headers, "Content-Length": buf.length });
  res.end(isHead ? undefined : buf);
}

function isValidSpaRoute(pathname) {
  return routeIsValidSpa(pathname, ARTICLE_SLUGS);
}

// Replace the __META_*__ placeholders in index.html with per-route values.
// Every replacement uses a FUNCTION value, not a string, so a $-sequence in the
// injected meta (e.g. an article title containing "$&") is inserted verbatim.
function injectMeta(html, meta) {
  return html
    .replace(/__META_SITE_NAME__/g, () => escapeHtml(SITE_CFG.name))
    .replace(/__META_TITLE__/g, () => escapeHtml(meta.title))
    .replace(/__META_DESCRIPTION__/g, () => escapeHtml(meta.description))
    .replace(/__META_URL__/g, () => escapeHtml(meta.url))
    .replace(/__META_IMAGE__/g, () => escapeHtml(meta.image))
    .replace(/__META_IMAGE_DIMS__/g, () =>
      meta.imageWidth && meta.imageHeight
        ? `<meta property="og:image:width" content="${meta.imageWidth}" />\n` +
          `<meta property="og:image:height" content="${meta.imageHeight}" />`
        : "")
    .replace(/__META_IMAGE_ALT__/g, () => escapeHtml(meta.imageAlt || meta.title))
    .replace(/__META_OG_TYPE__/g, () => escapeHtml(meta.ogType))
    .replace(/__META_JSONLD__/g, () => (meta.jsonLd ? jsonLdScript(meta.jsonLd) : ""))
    .replace(/__META_PRELOAD__/g, () => meta.preloadImage
      ? `<link rel="preload" as="image" href="${escapeHtml(meta.preloadImage)}" type="image/avif" fetchpriority="high" />`
      : "");
}

// Render the served HTML for a path from index.html. The SINGLE source of truth
// for the HTML pipeline — called by serveIndex (live) and the static build.
function renderHtml(templateHtml, pathname, { deployVersion, articleScripts, assetMap } = {}) {
  const map = assetMap || {};
  const meta = computePageMeta(pathname);
  const processedHtml = injectMeta(templateHtml, meta);
  const withArticles = articleScripts
    ? processedHtml.replace(
        '<script src="/data.js"></script>',
        () => `<script src="/data.js"></script>\n${articleScripts}`
      )
    : processedHtml;
  const hashed = withArticles.replace(
    /(<script\s+src=")\/dist\/([^"?]+)\.js(")/g,
    (match, prefix, name, suffix) => {
      const mapped = map[name];
      return mapped ? `${prefix}${mapped}${suffix}` : match;
    }
  );
  const versioned = hashed.replace(
    /((?:src|href)=")(\/(?!dist\/)[^"?]+\.(?:css|js|jsx))(")/g,
    `$1$2?v=${deployVersion}$3`
  );
  return versioned;
}

function serveIndex(req, res, filePath, pathname, statusCode = 200) {
  fs.readFile(filePath, "utf8", (err, html) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 Not Found");
      return;
    }
    const versioned = renderHtml(html, pathname, {
      deployVersion: DEPLOY_VERSION,
      articleScripts: ARTICLE_SCRIPTS,
      assetMap: ASSET_MAP,
    });
    const contentType = "text/html; charset=utf-8";
    writeCompressed(req, res, {
      "Content-Type": contentType,
      "Cache-Control": cacheHeaderFor(req, contentType),
      __status: statusCode,
    }, versioned, `html:${pathname}`);
  });
}

function sendFile(req, res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || "application/octet-stream";

  // Non-compressible binaries (images, video) are streamed and honour Range.
  if (!isCompressible(contentType)) {
    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("404 Not Found");
        return;
      }
      const size = stats.size;
      let start = 0;
      let end = size > 0 ? size - 1 : 0;
      let status = 200;
      const headers = {
        "Content-Type": contentType,
        "Cache-Control": cacheHeaderFor(req, contentType),
        "Accept-Ranges": "bytes",
      };

      const rangeHeader = req.headers["range"];
      if (rangeHeader) {
        const m = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader).trim());
        if (m && (m[1] !== "" || m[2] !== "")) {
          if (m[1] === "") {
            start = Math.max(0, size - parseInt(m[2], 10));
            end = size - 1;
          } else {
            start = parseInt(m[1], 10);
            end = m[2] === "" ? size - 1 : Math.min(parseInt(m[2], 10), size - 1);
          }
          if (start > end || start >= size) {
            res.writeHead(416, {
              "Content-Type": "text/plain; charset=utf-8",
              "Content-Range": `bytes */${size}`,
            });
            res.end("416 Range Not Satisfiable");
            return;
          }
          status = 206;
          headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
        }
      }

      headers["Content-Length"] = size === 0 ? 0 : end - start + 1;
      res.writeHead(status, headers);

      if (req.method === "HEAD" || size === 0) {
        res.end();
        return;
      }

      const stream = fs.createReadStream(filePath, { start, end });
      stream.on("error", () => res.destroy());
      res.on("close", () => stream.destroy());
      stream.pipe(res);
    });
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 Not Found");
      return;
    }
    writeCompressed(req, res, {
      "Content-Type": contentType,
      "Cache-Control": cacheHeaderFor(req, contentType),
    }, data, `file:${filePath}:${data.length}`);
  });
}

// Applied to every response. CSP is tuned to this site: self-hosted scripts,
// Google Fonts (stylesheet + font files) and the Google Maps embed iframe.
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "frame-src https://www.google.com https://maps.google.com",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'none'",
  ].join("; "),
};

// The repo root is the document root, so anything not listed here is public.
// Everything below is source, config, tooling, docs or project material.
const PRIVATE_PATHS = new Set([
  "/server.js",
  "/build-static.js",
  "/feeds.js",
  "/package.json",
  "/package-lock.json",
  "/.gitignore",
  "/LICENSE",
  "/README.md",
  "/news/README.md",
  "/dist/manifest.json",
  "/PROMPT.md",
]);

function isPrivatePath(pathname) {
  if (PRIVATE_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/scripts/")) return true;     // build tooling
  if (pathname.startsWith("/test/")) return true;        // test suite
  if (pathname.startsWith("/archive/")) return true;     // archived project material
  if (pathname.startsWith("/trash/")) return true;       // original masters
  if (pathname.startsWith("/palette/")) return true;     // design tokens
  if (pathname.endsWith(".docx")) return true;           // content brief
  if (/\/\.[^/]/.test(pathname)) return true;            // dotfiles (.git, .DS_Store, ...)
  return false;
}

const ALLOWED_METHODS = "GET, HEAD, OPTIONS";

function sendStatus(res, code, message, extraHeaders) {
  if (res.headersSent) return;
  res.writeHead(code, {
    "Content-Type": "text/plain; charset=utf-8",
    ...(extraHeaders || {}),
  });
  res.end(message);
}

const server = http.createServer((req, res) => {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }

  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "Allow": ALLOWED_METHODS, "Content-Length": 0 });
      res.end();
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      sendStatus(res, 405, "405 Method Not Allowed", { "Allow": ALLOWED_METHODS });
      return;
    }

    let parsedUrl;
    try {
      parsedUrl = parseRequestUrl(req);
    } catch {
      sendStatus(res, 400, "400 Bad Request");
      return;
    }
    let urlPathname;
    try {
      urlPathname = decodeURIComponent(parsedUrl.pathname);
    } catch {
      sendStatus(res, 400, "400 Bad Request");
      return;
    }
    if (urlPathname.includes("\x00")) {
      sendStatus(res, 400, "400 Bad Request");
      return;
    }

    // /index.html is the home page under a second URL. Redirect to "/".
    if (urlPathname === "/index.html") {
      res.writeHead(301, { "Location": "/", "Content-Type": "text/plain; charset=utf-8" });
      res.end("Moved Permanently");
      return;
    }

    let pathname = urlPathname;

    if (isPrivatePath(urlPathname)) {
      sendStatus(res, 404, "404 Not Found");
      return;
    }

    if (pathname.endsWith("/")) {
      pathname += "index.html";
    }

    const requestedPath = path.normalize(path.join(PUBLIC_DIR, pathname));

    if (requestedPath !== PUBLIC_DIR && !requestedPath.startsWith(PUBLIC_DIR + path.sep)) {
      sendStatus(res, 403, "403 Forbidden");
      return;
    }

    // Re-run the private-path guard on the CANONICAL (post-normalization) path.
    // A pre-normalized spelling such as "/%2e%2fserver.js" decodes to
    // "/./server.js", which slips past the raw-pathname check above (its "/."
    // is followed by "/") yet normalizes to "/server.js". Checking the
    // normalized, root-relative path closes that disclosure bypass.
    const canonicalPath =
      requestedPath === PUBLIC_DIR
        ? "/"
        : "/" + path.relative(PUBLIC_DIR, requestedPath).split(path.sep).join("/");
    if (isPrivatePath(canonicalPath)) {
      sendStatus(res, 404, "404 Not Found");
      return;
    }

    if (urlPathname === "/sitemap.xml") {
      const xml = buildSitemap({ articles: ARTICLES, siteCfg: SITE_CFG });
      writeCompressed(req, res, {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      }, xml, "feed:sitemap");
      return;
    }

    if (urlPathname === "/feed.json") {
      const json = buildFeed({ articles: ARTICLES, siteCfg: SITE_CFG });
      writeCompressed(req, res, {
        "Content-Type": "application/feed+json; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      }, json, "feed:json");
      return;
    }

    if (urlPathname === "/rss.xml") {
      const xml = buildRss({ articles: ARTICLES, siteCfg: SITE_CFG });
      writeCompressed(req, res, {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      }, xml, "feed:rss");
      return;
    }

    fs.stat(requestedPath, (err, stats) => {
      if (!err && stats.isFile()) {
        if (requestedPath.endsWith(".html")) {
          serveIndex(req, res, requestedPath, urlPathname);
        } else {
          sendFile(req, res, requestedPath);
        }
        return;
      }

      if (path.extname(urlPathname) !== "") {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("404 Not Found");
        return;
      }

      const statusCode = isValidSpaRoute(urlPathname) ? 200 : 404;
      serveIndex(req, res, path.join(PUBLIC_DIR, "index.html"), urlPathname, statusCode);
    });
  } catch (err) {
    console.error("Request handler error:", err && err.message);
    sendStatus(res, 500, "500 Internal Server Error");
  }
});

if (require.main === module) {
  server.on("clientError", (err, socket) => {
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
  });
  process.on("uncaughtException", (err) => {
    console.error("uncaughtException:", (err && err.stack) || err);
  });
  process.on("unhandledRejection", (err) => {
    console.error("unhandledRejection:", err);
  });
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Flora's Ballet website running on port ${PORT}`);
  });
}

module.exports = {
  server,
  renderHtml,
  computePageMeta,
  injectMeta,
  escapeHtml,
  jsonLdScript,
  cacheHeaderFor,
  isValidSpaRoute,
  loadArticleMeta,
  discoverArticleSlugs,
  SECURITY_HEADERS,
  isPrivatePath,
  DEPLOY_VERSION,
  ARTICLES,
  ARTICLE_SCRIPTS,
  ASSET_MAP,
  SITE_CFG,
};
