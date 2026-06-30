/* ============================================================
   site.config.js — single source of truth
   ------------------------------------------------------------
   Identity values that appear in multiple places (JSON-LD, OG
   tags, canonical URL, sitemap, contact section, footer).
   Change them here.

   Loads in both the browser (window.SITE) and Node (require),
   exactly like routes.js / article-schema.js / ui-helpers.js.
   ============================================================ */

const SITE = {
  url: "https://florasballet.gr",
  name: "Σχολή Μπαλέτου Φλώρας Μουστάκη",
  shortName: "Flora's Ballet",
  tagline: "Σχολή Μπαλέτου στο Μενίδι από το 1986",
  founded: "1986",
  email: "info@florasballet.gr",

  // Phones: `display` is shown to humans, `tel` is the tel: href target.
  phones: [
    { display: "210 2468962", tel: "+302102468962" },
    { display: "6989448068", tel: "+306989448068" },
  ],

  address: {
    street: "Κωνσταντινουπόλεως 322",
    area: "Μενίδι (Αχαρνές)",
    locality: "Αχαρνές",
    region: "Αττική",
    postalCode: "13671",
    country: "GR",
  },

  // Exact studio coordinates (used in the LocalBusiness geo + the map embed).
  geo: { lat: 38.078951, lng: 23.738587 },

  // Opening hours: `label` is shown to humans, `schema` is the schema.org
  // openingHours string used in the DanceSchool JSON-LD.
  hours: [
    { label: "Δευτέρα–Παρασκευή", time: "17:00–22:30", schema: "Mo-Fr 17:00-22:30" },
    { label: "Σάββατο", time: "10:00–15:00", schema: "Sa 10:00-15:00" },
  ],

  // No-API-key Google Maps embed pinned to the exact studio coordinates.
  mapEmbed: "https://www.google.com/maps?q=38.078951,23.738587&hl=el&z=16&output=embed",

  defaultImage: "/og-image.jpg",
  defaultDescription:
    "Αναγνωρισμένη από το κράτος σχολή μπαλέτου στο Μενίδι (Αχαρνές) από το 1986. Κλασικό μπαλέτο, σύγχρονος χορός, μουσικοκινητική αγωγή και μοντέρνο/hip hop, για όλες τις ηλικίες.",

  // Brand logos (40th-anniversary variants are the ones in use this year).
  logoNav: "/brand/logo-anniversary-nav.png",
  logoAnniversary: "/brand/logo-anniversary.png",
  logoOnWhite: "/brand/logo-anniversary-on-white.png",

  // Home hero carousel slides, in order. The first is the LCP image (preloaded
  // by the server as its AVIF sibling). Shared by carousel.jsx and server.js.
  carousel: [
    "/images/carousel/carousel-1.jpg",
    "/images/carousel/carousel-2.jpg",
    "/images/carousel/carousel-3.jpg",
    "/images/carousel/carousel-4.jpg",
  ],

  socialLinks: [
    "https://facebook.com/share/1EA49Tkd6i",
    "https://instagram.com/florasballet",
  ],
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = SITE;
} else if (typeof window !== "undefined") {
  window.SITE = SITE;
}
