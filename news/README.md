# Νέα & Ανακοινώσεις (Articles)

Each article is a self-contained package inside its own folder under `news/<slug>/`: the text, the cover image and any in-article photos all live together. Articles are sorted automatically by `date` (newest first), both on the homepage preview (capped at 4) and on the full `/nea` list page.

The static build (`build-static.js`) discovers `news/` at build time and injects a `<script>` tag for each `news/<slug>/article.js` it finds, and the local preview server (`server.js`) does the same on each request — so adding an article requires no edits to `data.js` or `index.html`.

## Add a new article

1. Create a new folder: `news/<slug>/` (the slug is the URL: `/nea/<slug>`).
2. Drop the cover image as `news/<slug>/cover.jpg` (16:10 works best for the card). Optionally drop in-article photos as `photo-01.jpg`, `photo-02.jpg`, …
3. Create `news/<slug>/article.js` using the template below:

```js
/* ============================================================
   Τίτλος του άρθρου
   ============================================================ */

defineArticle({
  slug: "to-slug-mou",                       // == folder name, lowercase/digits/hyphens
  date: "2026-05-12",                        // YYYY-MM-DD, used for sorting
  dateLabel: "12 Μαΐου 2026",                // free-form Greek, shown on the card
  location: "Μενίδι (Αχαρνές)",              // optional, shown after the date
  title: "Τίτλος του άρθρου",
  excerpt: "Μία ή δύο προτάσεις που εμφανίζονται στην κάρτα.",
  cover: "news/to-slug-mou/cover.jpg",       // optional: card + article cover
  photos: [                                  // optional: gallery
    "news/to-slug-mou/photo-01.jpg",
    // Or, to crop a photo from its top instead of its centre:
    { src: "news/to-slug-mou/photo-02.jpg", align: "top" },
  ],
  body: [
    "Πρώτη παράγραφος. Χρησιμοποιήστε **διπλούς αστερίσκους** για έντονα.",
    "Δεύτερη παράγραφος.",
  ],
  // ---- Optional SEO fields (used in JSON-LD / RSS / JSON Feed) ----
  keywords: ["μπαλέτο", "παράσταση"],        // string[] → Article.keywords + feed tags
  articleSection: "Ανακοινώσεις",            // string   → Article.articleSection
  sources: [                                 // optional, shown under the article
    { label: "Πηγή", href: "https://example.com" },
  ],
});
```

4. That's it: the article is auto-discovered at build time and, on the next deploy (a git push), appears at `/nea/<slug>`, on the homepage preview (if among the 3 most recent), and on the `/nea` list page.

### Fields

| Field | Required | Type | Used for |
|-------|----------|------|----------|
| `slug` | ✅ | string | URL `/nea/<slug>`; must equal the folder name (lowercase letters, digits and hyphens only) |
| `date` | ✅ | `YYYY-MM-DD` | Sorting (newest first), sitemap/RSS/feed dates |
| `dateLabel` | ✅ | string | Human-readable (Greek) date on the card/article |
| `title` | ✅ | string | Heading, `<title>`, JSON-LD headline |
| `excerpt` | ✅ | string | Card preview, meta description, RSS/feed summary |
| `body` | ✅ | string[] | Article paragraphs (`**bold**` supported); also JSON-LD `articleBody` |
| `location` | optional | string | Shown after the date |
| `cover` | optional | path | Card thumbnail + article cover (`og:image` for the article) |
| `photos` | optional | (string \| `{ src, align }`)[] | Gallery; `align: "top"` crops from the top |
| `video` | optional | path | Self-hosted `<video>` embed |
| `poster` | optional | path | Poster image for `video`; falls back to `cover` |
| `keywords` | optional | string[] | JSON-LD `keywords` + JSON Feed `tags` |
| `articleSection` | optional | string | JSON-LD `articleSection` |
| `sources` | optional | `{ label, href }`[] | Source links under the article |

Validation lives in `article-schema.js` (`validateArticle`) and runs in **both** the browser (`defineArticle`) and the server (`loadArticleMeta`, which logs and skips an invalid article so bad data never reaches the feeds).

## Routes

- `/`: homepage with the news preview (max 4, newest first)
- `/nea`: full list of all articles
- `/nea/<slug>`: single article view

## Tweaking the homepage cap

Edit `LIMITS.newsPreview` in `/data.js` (default: `4`). The "Όλα τα νέα" link appears automatically when there are more articles than the cap.
