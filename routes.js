/* ============================================================
   routes.js — single source of truth for the route table
   ------------------------------------------------------------
   One parser shared by every consumer so the URL→view mapping
   can never silently diverge:
     - app.jsx           uses parseRoute (client router)
     - components/*       use routeToPath (link hrefs)
     - server.js          uses parseRoute (computePageMeta) and
                          isValidSpaRoute (200 vs 404 fallback)

   Pure string logic only — no React, no DOM, no Node APIs — so it
   loads identically in the browser (window globals) and in Node
   (require), exactly like site.config.js.

   Routes:
     /                 home          { page: "home", section: null }
     /i-scholi         school        { page: "school" }
     /didaskontes      teachers      { page: "teachers" }
     /diagonismoi      competitions  { page: "competitions" }
     /nea              news list     { page: "news-list" }
     /nea/<slug>       article       { page: "article", slug }
     /epikoinonia      contact       { page: "contact" }
     (anything else)   not found     { page: "not-found" }
   ============================================================ */

(function () {
  function parseRoute(pathname) {
    const p = String(pathname || "/").replace(/\/+$/, "") || "/";
    if (p === "/" || p === "") return { page: "home", section: null };
    if (p === "/i-scholi") return { page: "school" };
    if (p === "/didaskontes") return { page: "teachers" };
    if (p === "/diagonismoi") return { page: "competitions" };
    if (p === "/nea") return { page: "news-list" };
    if (p === "/epikoinonia") return { page: "contact" };
    const m = p.match(/^\/nea\/([^/]+)$/);
    if (m) return { page: "article", slug: m[1] };
    return { page: "not-found" };
  }

  function routeToPath(route) {
    if (!route) return "/";
    if (route.page === "school") return "/i-scholi";
    if (route.page === "teachers") return "/didaskontes";
    if (route.page === "competitions") return "/diagonismoi";
    if (route.page === "news-list") return "/nea";
    if (route.page === "article") return "/nea/" + route.slug;
    if (route.page === "contact") return "/epikoinonia";
    if (route.page === "home" && route.section) return "/#" + route.section;
    return "/";
  }

  // True when pathname maps to a renderable SPA route. When knownSlugs is
  // supplied (server side), an article route is only valid if its slug exists;
  // omit it (client side) to accept any well-formed article path.
  function isValidSpaRoute(pathname, knownSlugs) {
    const route = parseRoute(pathname);
    if (route.page === "not-found") return false;
    if (route.page === "article") {
      if (!knownSlugs) return true;
      const set = Array.isArray(knownSlugs) ? new Set(knownSlugs) : knownSlugs;
      return set.has(route.slug);
    }
    return true;
  }

  // The document <title> for a route. Single source of truth shared by the
  // server (computePageMeta, injected into the served HTML) and the client
  // (navigate, which keeps the tab title correct after SPA navigation).
  // ctx: { siteName, tagline, articleTitle }.
  function pageTitle(route, ctx) {
    switch (route && route.page) {
      case "home":
        return ctx.siteName;
      case "school":
        return `Η Σχολή – ${ctx.siteName}`;
      case "teachers":
        return `Διδάσκοντες – ${ctx.siteName}`;
      case "competitions":
        return `Διαγωνισμοί – ${ctx.siteName}`;
      case "news-list":
        return `Νέα & Ανακοινώσεις – ${ctx.siteName}`;
      case "contact":
        return `Επικοινωνία – ${ctx.siteName}`;
      case "article":
        return ctx.articleTitle
          ? `${ctx.articleTitle} – ${ctx.siteName}`
          : `Η σελίδα δεν βρέθηκε – ${ctx.siteName}`;
      default:
        return `Η σελίδα δεν βρέθηκε – ${ctx.siteName}`;
    }
  }

  const api = { parseRoute, routeToPath, isValidSpaRoute, pageTitle };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof window !== "undefined") {
    Object.assign(window, api);
  }
})();
