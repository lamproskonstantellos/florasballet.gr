/* ============================================================
   article-schema.js — single source of truth for article data
   ------------------------------------------------------------
   Shared between the browser (data.js / defineArticle) and Node
   (server.js / loadArticleMeta) so an article is validated and
   ordered identically in both worlds. A field the browser would
   reject can therefore never ship into RSS / JSON-LD / sitemap.

   Loads in both environments like site.config.js.
   ============================================================ */

(function () {
  // Throws on any field a published article must not have. Used by
  // defineArticle (browser, fails loudly in the console) and loadArticleMeta
  // (server, logs and skips the article so bad data never reaches a feed).
  function validateArticle(article) {
    const required = ["slug", "date", "dateLabel", "title", "excerpt", "body"];
    for (const field of required) {
      if (article[field] === undefined || article[field] === null || article[field] === "") {
        throw new Error(
          `[article] "${article.slug || "(no slug)"}" is missing required field: ${field}`
        );
      }
    }
    // The slug is a URL path segment (/nea/<slug>) and a folder name, so it
    // must be URL-safe. Constraining it here (both worlds) keeps a stray
    // character out of the unescaped <loc>/<link>/<guid> interpolations in the
    // sitemap and RSS feed and out of the injected <script src> path.
    if (!/^[a-z0-9-]+$/.test(article.slug)) {
      throw new Error(
        `[article] "${article.slug}" has an invalid slug — use lowercase letters, digits and hyphens`
      );
    }
    // dateLabel stays free-form (Greek), only the machine date is constrained.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(article.date)) {
      throw new Error(
        `[article] "${article.slug}" has invalid date "${article.date}" — expected YYYY-MM-DD`
      );
    }
    if (!Array.isArray(article.body) || article.body.length === 0) {
      throw new Error(`[article] "${article.slug}" has empty or non-array body`);
    }
    if (article.photos && !Array.isArray(article.photos)) {
      throw new Error(`[article] "${article.slug}" has non-array photos`);
    }
    if (article.sources && !Array.isArray(article.sources)) {
      throw new Error(`[article] "${article.slug}" has non-array sources`);
    }
    if (article.keywords && !Array.isArray(article.keywords)) {
      throw new Error(`[article] "${article.slug}" has non-array keywords`);
    }
    if (article.topics && !Array.isArray(article.topics)) {
      throw new Error(`[article] "${article.slug}" has non-array topics`);
    }
    if (article.video !== undefined && typeof article.video !== "string") {
      throw new Error(`[article] "${article.slug}" has non-string video`);
    }
    if (article.poster !== undefined && typeof article.poster !== "string") {
      throw new Error(`[article] "${article.slug}" has non-string poster`);
    }
    // cover is the highest-consequence path field — it is interpolated
    // (unescaped) into og:image / twitter:image / schema.org image and the JSON
    // Feed image, and joined onto a filesystem path for its dimensions. A
    // non-string value would break those sinks, so constrain it like the others.
    if (article.cover !== undefined && typeof article.cover !== "string") {
      throw new Error(`[article] "${article.slug}" has non-string cover`);
    }
    // A sources entry must be an object with an http(s) href and a label: the
    // href lands in an <a href> with no scheme normalization (unlike cover /
    // photos, which pass through asset()), and a malformed entry throws inside
    // the article render, blanking the page.
    if (Array.isArray(article.sources)) {
      for (const s of article.sources) {
        const ok =
          s && typeof s === "object" &&
          typeof s.href === "string" && /^https?:\/\//.test(s.href) &&
          typeof s.label === "string" && s.label !== "";
        if (!ok) {
          throw new Error(
            `[article] "${article.slug}" has an invalid sources entry (expected { href: "http(s)://…", label: "…" })`
          );
        }
      }
    }
    // A photos entry is either a path string or { src, alt?, align? } — an
    // author-supplied alt (when present) must be a string.
    if (Array.isArray(article.photos)) {
      for (const p of article.photos) {
        const ok =
          typeof p === "string" ||
          (p && typeof p === "object" && typeof p.src === "string" &&
            (p.alt === undefined || typeof p.alt === "string"));
        if (!ok) {
          throw new Error(
            `[article] "${article.slug}" has an invalid photos entry (expected a path string or { src, alt? })`
          );
        }
      }
    }
    return article;
  }

  // Newest first, by ISO date string. Stable for equal dates (returns 0).
  function compareByDateDesc(a, b) {
    if (a.date < b.date) return 1;
    if (a.date > b.date) return -1;
    return 0;
  }

  const api = { validateArticle, compareByDateDesc };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof window !== "undefined") {
    Object.assign(window, { ArticleSchema: api, validateArticle, compareByDateDesc });
  }
})();
