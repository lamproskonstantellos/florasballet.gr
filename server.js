const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const { URL } = require("url");
const SITE_CFG = require("./site.config.js");
const { parseRoute, isValidSpaRoute: routeIsValidSpa, pageTitle } = require("./routes.js");
const { validateArticle, compareByDateDesc } = require("./article-schema.js");
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

// The home page's canonical / og:url / sitemap <loc> all carry a trailing slash
// ("https://florasballet.gr/"), so every JSON-LD reference to the home resource
// must use the SAME spelling or the breadcrumb root fails to string-match the
// page it points at. HOME_URL is that single spelling; ORG_ID/SITE_ID are stable
// node identifiers so the DanceSchool, WebSite and per-article publisher/author
// reconcile into one linked entity instead of three disconnected ones.
const HOME_URL = `${SITE_CFG.url}/`;
const ORG_ID = `${SITE_CFG.url}/#organization`;
const SITE_ID = `${SITE_CFG.url}/#website`;

// Local time zone offset for Greece (EET/EEST). Article dates are stored as bare
// YYYY-MM-DD; stamping a fixed offset keeps datePublished/dateModified from
// being interpreted in the crawler's own zone (which can shift the SERP date).
const TZ_OFFSET = "+03:00";

// Map a schema.org openingHours shorthand ("Mo-Fr 17:00-22:30") to an
// OpeningHoursSpecification object, the form Google actually consumes for the
// local-business rich result.
const DAY_ORDER = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const DAY_NAMES = {
  Mo: "Monday", Tu: "Tuesday", We: "Wednesday", Th: "Thursday",
  Fr: "Friday", Sa: "Saturday", Su: "Sunday",
};
function openingHoursSpec(shorthand) {
  const [days, hours] = shorthand.split(" ");
  const [opens, closes] = hours.split("-");
  let codes;
  if (days.includes("-")) {
    const [a, b] = days.split("-");
    codes = DAY_ORDER.slice(DAY_ORDER.indexOf(a), DAY_ORDER.indexOf(b) + 1);
  } else {
    codes = [days];
  }
  return {
    "@type": "OpeningHoursSpecification",
    "dayOfWeek": codes.map((c) => DAY_NAMES[c]),
    "opens": opens,
    "closes": closes,
  };
}

// Strip the inline **bold** emphasis markers from body text before it goes into
// machine-read surfaces (JSON-LD articleBody, JSON Feed content_text): the
// browser renders ** as <strong>, so the markers never appear to a human and
// must not appear in structured data or a plain-text feed either.
function stripEmphasis(s) {
  return String(s).replace(/\*\*([^*]+)\*\*/g, "$1");
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
      "@id": SITE_ID,
      "name": SITE_CFG.name,
      "url": HOME_URL,
      "inLanguage": "el",
      "publisher": { "@id": ORG_ID },
    },
    {
      "@type": ["DanceSchool", "LocalBusiness"],
      "@id": ORG_ID,
      "name": SITE_CFG.name,
      "alternateName": SITE_CFG.shortName,
      "url": HOME_URL,
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
      "openingHoursSpecification": SITE_CFG.hours.map((h) => openingHoursSpec(h.schema)),
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
          { "@type": "ListItem", "position": 1, "name": "Αρχική", "item": HOME_URL },
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
// Null-prototype maps: the request-derived slug indexes these directly
// (computePageMeta), so an inherited key like "constructor" or "__proto__" must
// not resolve to a truthy Object.prototype member and take the article branch.
const ARTICLE_META = Object.create(null);
const ARTICLE_COVER_DIMS = Object.create(null);
const ARTICLE_COVER_VERSION = Object.create(null);
for (const slug of ARTICLE_SLUGS) {
  const meta = loadArticleMeta(slug);
  ARTICLE_META[slug] = meta;
  if (meta && meta.cover) {
    ARTICLE_COVER_DIMS[slug] = imageDims(path.join(PUBLIC_DIR, meta.cover));
    ARTICLE_COVER_VERSION[slug] = imageVersion(path.join(PUBLIC_DIR, meta.cover));
  }
}
// Only slugs whose article.js loaded AND validated are routable/shippable. A
// folder with an invalid article.js (loadArticleMeta returned null) must not
// become a 200 route or inject a <script> that throws validateArticle in the
// browser — it would be a soft-404 with broken JS.
const VALID_ARTICLE_SLUGS = ARTICLE_SLUGS.filter((slug) => ARTICLE_META[slug]);
const ARTICLES = VALID_ARTICLE_SLUGS.map((slug) => ARTICLE_META[slug]);
const ARTICLE_SCRIPTS = VALID_ARTICLE_SLUGS
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
    const jsonLd = breadcrumbJsonLd(stat.label, stat.path);
    // /nea is a collection page: enumerate the articles (newest first) as an
    // ItemList so the index is associated with the posts it lists and crawlers
    // get an in-HTML list of article URLs the JS-free document otherwise lacks.
    if (route.page === "news-list" && ARTICLES.length) {
      const ordered = [...ARTICLES].sort(compareByDateDesc);
      jsonLd["@graph"].push({
        "@type": "ItemList",
        "itemListElement": ordered.map((a, i) => ({
          "@type": "ListItem",
          "position": i + 1,
          "url": `${SITE_CFG.url}/nea/${a.slug}`,
          "name": a.title,
        })),
      });
    }
    return {
      title: pageTitle(route, titleCtx),
      description: stat.description,
      url: `${SITE_CFG.url}${stat.path}`,
      image: DEFAULT_IMAGE,
      imageWidth: DEFAULT_IMAGE_DIMS && DEFAULT_IMAGE_DIMS.width,
      imageHeight: DEFAULT_IMAGE_DIMS && DEFAULT_IMAGE_DIMS.height,
      imageAlt: SITE_CFG.name,
      ogType: "website",
      jsonLd,
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

      const articleBody = Array.isArray(article.body)
        ? stripEmphasis(article.body.join("\n\n"))
        : "";
      const wordCount = articleBody ? articleBody.trim().split(/\s+/).length : 0;
      const dateTime = `${article.date}T00:00:00${TZ_OFFSET}`;

      const articleSchema = {
        "@type": "Article",
        "headline": article.title,
        "description": article.excerpt,
        "image": image,
        "datePublished": dateTime,
        "dateModified": dateTime,
        "author": { "@type": "Organization", "@id": ORG_ID, "name": SITE_CFG.name, "url": HOME_URL },
        "publisher": {
          "@type": "Organization",
          "@id": ORG_ID,
          "name": SITE_CFG.name,
          "url": HOME_URL,
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
          { "@type": "ListItem", "position": 1, "name": "Αρχική", "item": HOME_URL },
          { "@type": "ListItem", "position": 2, "name": "Νέα & Ανακοινώσεις", "item": `${SITE_CFG.url}/nea` },
          { "@type": "ListItem", "position": 3, "name": article.title, "item": `${SITE_CFG.url}/nea/${article.slug}` },
        ],
      };

      // Open Graph `article` object properties — the timestamp, section and tags
      // that Facebook/LinkedIn/Slack render on the unfurl card. Every value is
      // already in the JSON-LD on the same page; this just exposes it to OG.
      const articleTagLines = [
        `<meta property="article:published_time" content="${escapeHtml(dateTime)}" />`,
        `<meta property="article:modified_time" content="${escapeHtml(dateTime)}" />`,
      ];
      if (article.articleSection) {
        articleTagLines.push(`<meta property="article:section" content="${escapeHtml(article.articleSection)}" />`);
      }
      for (const kw of article.keywords || []) {
        articleTagLines.push(`<meta property="article:tag" content="${escapeHtml(kw)}" />`);
      }

      return {
        title: pageTitle(route, { ...titleCtx, articleTitle: article.title }),
        description: article.excerpt,
        url: `${SITE_CFG.url}/nea/${article.slug}`,
        image,
        imageWidth: imageDimensions && imageDimensions.width,
        imageHeight: imageDimensions && imageDimensions.height,
        imageAlt: article.title,
        ogType: "article",
        articleTags: articleTagLines.join("\n"),
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
  // Build the URL by concatenation, not the (input, base) form: the base form
  // treats an origin-form target that begins with two slashes (e.g. "//nea") as
  // a protocol-relative reference, moving the first path segment into the host
  // and dropping it from the pathname. Collapse leading slashes and prefix the
  // origin so "//nea" stays "/nea" and the query string is preserved.
  let target = req.url || "/";
  if (target[0] !== "/") target = "/" + target;
  target = target.replace(/^\/+/, "/");
  return new URL("http://localhost" + target);
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

  // Content-negotiated resources must carry Vary even when served uncompressed
  // (body ≤1024 bytes, or the client sent no Accept-Encoding), so a shared cache
  // does not reuse an identity body for a client that would accept br/gzip.
  const baseHeaders = { ...headers, "Content-Length": buf.length };
  if (isCompressible(ct)) baseHeaders["Vary"] = "Accept-Encoding";
  res.writeHead(status, baseHeaders);
  res.end(isHead ? undefined : buf);
}

function isValidSpaRoute(pathname) {
  return routeIsValidSpa(pathname, VALID_ARTICLE_SLUGS);
}

// Replace the __META_*__ placeholders in index.html with per-route values.
// A SINGLE pass over the template: each token is resolved from `values` via a
// function (so a $-sequence in the injected meta, e.g. an article title with
// "$&", is inserted verbatim), and — critically — a value injected by one token
// is never re-scanned for another token. A sequential chain of .replace() calls
// would let an early value that happens to contain a literal later token
// (e.g. "__META_JSONLD__") be substituted by the later pass, emitting raw markup
// into an attribute; the single pass closes that second-order injection.
function injectMeta(html, meta) {
  const values = {
    SITE_NAME: () => escapeHtml(SITE_CFG.name),
    TITLE: () => escapeHtml(meta.title),
    DESCRIPTION: () => escapeHtml(meta.description),
    URL: () => escapeHtml(meta.url),
    IMAGE: () => escapeHtml(meta.image),
    IMAGE_DIMS: () =>
      meta.imageWidth && meta.imageHeight
        ? `<meta property="og:image:width" content="${meta.imageWidth}" />\n` +
          `<meta property="og:image:height" content="${meta.imageHeight}" />`
        : "",
    IMAGE_ALT: () => escapeHtml(meta.imageAlt || meta.title),
    OG_TYPE: () => escapeHtml(meta.ogType),
    ARTICLE_TAGS: () => (meta.articleTags ? meta.articleTags : ""),
    // Emit the whole <script> element only when there is a graph, so routes
    // with no structured data (the 404 page) ship no empty ld+json block for a
    // validator to choke on.
    JSONLD: () =>
      meta.jsonLd
        ? `<script type="application/ld+json">${jsonLdScript(meta.jsonLd)}</script>`
        : "",
    PRELOAD: () => meta.preloadImage
      ? `<link rel="preload" as="image" href="${escapeHtml(meta.preloadImage)}" type="image/avif" fetchpriority="high" />`
      : "",
  };
  return html.replace(/__META_([A-Z_]+)__/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key]() : m
  );
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
  // Block other origins from embedding the site's images (the performance/class
  // photographs, many depicting minors, that the licence forbids reusing). Only
  // stops hotlinking/no-cors embedding, not server-side re-hosting.
  "Cross-Origin-Resource-Policy": "same-origin",
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
  if (pathname.startsWith("/components/")) return true;  // JSX source (compiled into /dist)
  if (pathname.startsWith("/node_modules/")) return true;// installed dependencies
  if (pathname.startsWith("/build/")) return true;       // generated static build output
  if (pathname.startsWith("/scratch/")) return true;     // local scratch (gitignored)
  if (pathname.startsWith("/archive/")) return true;     // archived project material
  if (pathname.startsWith("/trash/")) return true;       // original masters
  if (pathname.startsWith("/palette/")) return true;     // design tokens
  if (pathname.startsWith("/_reference/")) return true;  // reference screenshots
  if (pathname.endsWith(".jsx")) return true;            // JSX source (app.jsx, icons.jsx)
  if (pathname.endsWith(".md")) return true;             // docs (README, briefs)
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
      // RFC 9110 §6.4.1 / RFC 9112: a 204 response must carry no Content-Length.
      res.writeHead(204, { "Allow": ALLOWED_METHODS });
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
  VALID_ARTICLE_SLUGS,
  SECURITY_HEADERS,
  isPrivatePath,
  DEPLOY_VERSION,
  ARTICLES,
  ARTICLE_SCRIPTS,
  ASSET_MAP,
  SITE_CFG,
};
