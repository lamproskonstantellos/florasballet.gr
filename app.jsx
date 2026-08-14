/* global React, ReactDOM, SITE, Icon, Carousel,
   parseRoute, routeToPath, pageTitle, getArticle, handleAnchorClick,
   pickActiveSection,
   HomeIntro, WhyUs, Courses, Contact,
   NewsPreview, NewsListPage, Article,
   SchoolPage, TeachersPage, CompetitionsPage */

const { useState, useEffect, useCallback, useRef } = React;

// The sticky header's height varies with the breakpoint (logo + padding), so
// measure it at scroll time instead of hard-coding a constant that drifts.
const HEADER_GAP = 12;
function headerOffset() {
  const header = typeof document !== "undefined" && document.querySelector(".site-header");
  return (header ? header.offsetHeight : 116) + HEADER_GAP;
}

// Honour prefers-reduced-motion for programmatic scrolling: an explicit
// `behavior` in ScrollToOptions overrides the CSS scroll-behavior, so the media
// query must be checked here too.
function scrollBehavior() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

function hoverCapable() {
  return !!(window.matchMedia && window.matchMedia("(hover: hover)").matches);
}

/* ============================================================
   HEADER — sticky, translucent, with the «Η Σχολή» dropdown and
   a mobile hamburger panel. Active state follows the route and
   the homepage scroll-spy.
   ============================================================ */

function Header({ route, navigate, activeSection }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSubOpen, setMobileSubOpen] = useState(false);
  const dropdownRef = useRef(null);
  const dropdownTriggerRef = useRef(null);
  const mobileRef = useRef(null);
  const toggleRef = useRef(null);

  const schoolActive = route.page === "school" || route.page === "teachers";
  const newsActive = route.page === "news-list" || route.page === "article";
  const onHome = route.page === "home";

  // Close the desktop dropdown on outside click / Escape.
  useEffect(() => {
    if (!dropdownOpen) return;
    const onDoc = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false);
    };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setDropdownOpen(false);
      // Return focus to the trigger ONLY if focus is actually inside the
      // dropdown (it would land on a now-hidden menu item and fall to <body>).
      // The dropdown also opens on hover with focus elsewhere on the page —
      // stealing focus up to the nav on that Escape would lose the user's place.
      if (
        dropdownTriggerRef.current &&
        dropdownRef.current &&
        dropdownRef.current.contains(document.activeElement)
      ) {
        dropdownTriggerRef.current.focus();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [dropdownOpen]);

  // Mobile panel: lock scroll, trap focus, close on Escape; restore focus.
  useEffect(() => {
    if (!mobileOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = mobileRef.current;
    const focusables = panel
      ? panel.querySelectorAll('a[href], button:not([disabled])')
      : [];
    if (focusables.length) focusables[0].focus();
    const onKey = (e) => {
      if (e.key === "Escape") { setMobileOpen(false); return; }
      if (e.key === "Tab" && focusables.length) {
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      if (toggleRef.current) toggleRef.current.focus();
    };
  }, [mobileOpen]);

  // Close the mobile panel when the viewport widens past the breakpoint where
  // the desktop nav returns — otherwise a fixed drawer + backdrop (with body
  // scroll still locked) is left over the desktop layout, its toggle now hidden.
  useEffect(() => {
    if (!mobileOpen || !window.matchMedia) return;
    const mq = window.matchMedia("(min-width: 821px)");
    const onChange = () => { if (mq.matches) setMobileOpen(false); };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else if (mq.removeListener) mq.removeListener(onChange);
    };
  }, [mobileOpen]);

  const go = (e, target) => {
    handleAnchorClick(e, navigate, target);
    setDropdownOpen(false);
    setMobileOpen(false);
  };

  const TEACH = { page: "teachers" };
  const ABOUT = { page: "school" };
  const MATH = { page: "home", section: "mathimata" };
  const COMP = { page: "competitions" };
  // With zero articles NewsPreview renders nothing, so the home #nea anchor
  // does not exist — point the nav at /nea (which has its own empty state).
  const NEWS = (window.NEWS_ARTICLES || []).length
    ? { page: "home", section: "nea" }
    : { page: "news-list" };
  const CONTACT = { page: "contact" };

  return (
    <>
    <header className="site-header">
      <div className="site-header-inner">
        <a
          className="brand"
          href="/"
          aria-label={`${SITE.name}, Αρχική`}
          onClick={(e) => go(e, { page: "home" })}
        >
          <img className="brand-logo" src={SITE.logoNav} alt={SITE.name} width="550" height="270" />
        </a>

        {/* Desktop nav */}
        <nav className="nav" aria-label="Κύρια πλοήγηση">
          <div
            className={"nav-dropdown" + (schoolActive ? " active" : "")}
            ref={dropdownRef}
            data-open={dropdownOpen ? "true" : "false"}
            onMouseEnter={() => { if (hoverCapable()) setDropdownOpen(true); }}
            onMouseLeave={() => { if (hoverCapable()) setDropdownOpen(false); }}
          >
            <button
              type="button"
              className="nav-dropdown-trigger"
              ref={dropdownTriggerRef}
              aria-expanded={dropdownOpen ? "true" : "false"}
              onClick={() => setDropdownOpen((o) => !o)}
            >
              Η Σχολή <Icon.chevron className="chev" style={{ width: 13, height: 13 }} />
            </button>
            <div className="dropdown-menu">
              <a
                className={route.page === "school" ? "active" : ""}
                href={routeToPath(ABOUT)}
                onClick={(e) => go(e, ABOUT)}
              >
                Εμείς
              </a>
              <a
                className={route.page === "teachers" ? "active" : ""}
                href={routeToPath(TEACH)}
                onClick={(e) => go(e, TEACH)}
              >
                Διδάσκοντες
              </a>
            </div>
          </div>

          <a
            className={"nav-link" + (onHome && activeSection === "mathimata" ? " active" : "")}
            href={routeToPath(MATH)}
            onClick={(e) => go(e, MATH)}
          >
            Μαθήματα
          </a>
          <a
            className={"nav-link" + (route.page === "competitions" ? " active" : "")}
            href={routeToPath(COMP)}
            onClick={(e) => go(e, COMP)}
          >
            Διαγωνισμοί
          </a>
          <a
            className={"nav-link" + ((onHome && activeSection === "nea") || newsActive ? " active" : "")}
            href={routeToPath(NEWS)}
            onClick={(e) => go(e, NEWS)}
          >
            Νέα &amp; Ανακοινώσεις
          </a>
          <a
            className="nav-cta"
            href={routeToPath(CONTACT)}
            onClick={(e) => go(e, CONTACT)}
          >
            Επικοινωνία
          </a>
        </nav>

        {/* Mobile hamburger */}
        <button
          type="button"
          className="nav-toggle"
          ref={toggleRef}
          aria-label="Άνοιγμα μενού"
          aria-expanded={mobileOpen ? "true" : "false"}
          onClick={() => setMobileOpen(true)}
        >
          <Icon.menu style={{ width: 24, height: 24 }} />
        </button>
      </div>
      </header>

      {/* Mobile panel — rendered as a sibling of the header, not a child: the
          header's backdrop-filter establishes a containing block for fixed
          descendants, which would otherwise clip this position:fixed panel to
          the header's own height instead of letting it fill the viewport. */}
      {mobileOpen && (
        <>
          <div className="mobile-backdrop" onClick={() => setMobileOpen(false)} />
          <div className="mobile-menu" ref={mobileRef} role="dialog" aria-modal="true" aria-label="Μενού">
            <div className="mobile-menu-head">
              <a
                className="brand"
                href="/"
                aria-label={`${SITE.name}, Αρχική`}
                onClick={(e) => go(e, { page: "home" })}
              >
                <img src={SITE.logoNav} alt={SITE.name} width="550" height="270" />
              </a>
              <button
                type="button"
                className="mobile-close"
                aria-label="Κλείσιμο μενού"
                onClick={() => setMobileOpen(false)}
              >
                <Icon.close style={{ width: 24, height: 24 }} />
              </button>
            </div>

            <nav aria-label="Κύρια πλοήγηση">
              <button
                type="button"
                className={"mobile-sub-trigger" + (schoolActive ? " active" : "")}
                aria-expanded={mobileSubOpen ? "true" : "false"}
                onClick={() => setMobileSubOpen((o) => !o)}
              >
                Η Σχολή <Icon.chevron className="chev" style={{ width: 15, height: 15 }} />
              </button>
              <div className={"mobile-sub" + (mobileSubOpen ? " open" : "")}>
                <a className={route.page === "school" ? "active" : ""} href={routeToPath(ABOUT)} onClick={(e) => go(e, ABOUT)}>Εμείς</a>
                <a className={route.page === "teachers" ? "active" : ""} href={routeToPath(TEACH)} onClick={(e) => go(e, TEACH)}>Διδάσκοντες</a>
              </div>

              <a className={"mobile-link" + (onHome && activeSection === "mathimata" ? " active" : "")} href={routeToPath(MATH)} onClick={(e) => go(e, MATH)}>Μαθήματα</a>
              <a className={"mobile-link" + (route.page === "competitions" ? " active" : "")} href={routeToPath(COMP)} onClick={(e) => go(e, COMP)}>Διαγωνισμοί</a>
              <a className={"mobile-link" + ((onHome && activeSection === "nea") || newsActive ? " active" : "")} href={routeToPath(NEWS)} onClick={(e) => go(e, NEWS)}>Νέα &amp; Ανακοινώσεις</a>
              <a className="mobile-cta" href={routeToPath(CONTACT)} onClick={(e) => go(e, CONTACT)}>Επικοινωνία</a>
            </nav>
          </div>
        </>
      )}
    </>
  );
}

/* ============================================================
   FOOTER
   ============================================================ */

function Footer() {
  const [fb, ig] = SITE.socialLinks;
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="footer-brand">
          <img src={SITE.logoOnWhite} alt={SITE.name} width="550" height="270" />
          <p>Αναγνωρισμένη από το κράτος σχολή μπαλέτου στο Μενίδι, από το 1986.</p>
        </div>

        <div className="footer-col">
          <h4>Επικοινωνία</h4>
          <p>
            <a href={SITE.mapsLink} target="_blank" rel="noopener noreferrer">
              {SITE.address.street}<br />{SITE.address.postalCode} {SITE.address.area}
            </a>
          </p>
          {SITE.phones.map((p) => (
            <a key={p.tel} href={`tel:${p.tel}`}>{p.display}</a>
          ))}
          <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
        </div>

        <div className="footer-col">
          <h4>Ώρες λειτουργίας</h4>
          {SITE.hours.map((h) => (
            <p key={h.label}>{h.label}<br />{h.time}</p>
          ))}
          <div className="footer-social">
            <a href={fb} target="_blank" rel="noopener noreferrer" aria-label="Facebook">
              <Icon.facebook style={{ width: 18, height: 18 }} />
            </a>
            <a href={ig} target="_blank" rel="noopener noreferrer" aria-label="Instagram">
              <Icon.instagram style={{ width: 18, height: 18 }} />
            </a>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <div className="footer-bottom-inner">
          © {new Date().getFullYear()} {SITE.name}
        </div>
      </div>
    </footer>
  );
}

/* ============================================================
   HOME PAGE
   ============================================================ */

function HomePage({ navigate }) {
  return (
    <div className="page">
      <Carousel />
      <HomeIntro />
      <WhyUs />
      <Courses />
      <NewsPreview navigate={navigate} />
    </div>
  );
}

/* ============================================================
   CONTACT PAGE — the «Επικοινωνία» section promoted to its own
   route (/epikoinonia) so it isn't duplicated above the footer.
   ============================================================ */

function ContactPage() {
  // Reset scroll on mount like every other route component: the «Επικοινωνία»
  // control is reachable from any scroll depth, and without this the shorter
  // contact page keeps the old scrollY and lands the viewport at the footer.
  useEffect(() => { window.scrollTo({ top: 0 }); }, []);
  return (
    <div className="page contact-page">
      <Contact />
    </div>
  );
}

/* ============================================================
   NOT FOUND
   ============================================================ */

function NotFound({ navigate }) {
  useEffect(() => { window.scrollTo({ top: 0 }); }, []);
  return (
    <div className="page notfound">
      <div className="notfound-code" aria-hidden="true">404</div>
      <h1>Η σελίδα δεν βρέθηκε</h1>
      <p className="notfound-sub">Η σελίδα μπορεί να μετακινήθηκε ή να μην υπήρξε ποτέ.</p>
      <div className="notfound-actions">
        <a
          className="btn btn-primary"
          href="/"
          onClick={(e) => handleAnchorClick(e, navigate, { page: "home" })}
        >
          Αρχική
        </a>
        <a
          className="btn btn-ghost"
          href="/nea"
          onClick={(e) => handleAnchorClick(e, navigate, { page: "news-list" })}
        >
          Νέα
        </a>
        <a
          className="btn btn-ghost"
          href="/epikoinonia"
          onClick={(e) => handleAnchorClick(e, navigate, { page: "contact" })}
        >
          Επικοινωνία
        </a>
      </div>
    </div>
  );
}

/* ============================================================
   APP
   ============================================================ */

const HOME_SECTION_IDS = ["giati-emas", "mathimata", "nea"];

function App() {
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname));
  const [activeSection, setActiveSection] = useState(null);
  const mainRef = useRef(null);
  const firstRender = useRef(true);

  useEffect(() => {
    const onPop = () => {
      const route = parseRoute(window.location.pathname);
      setRoute(route);
      // Honour a #section on Back/Forward to a home entry: navigate() pushes
      // hash-bearing URLs (/#mathimata), but the browser's scroll restoration
      // knows nothing about the sticky-header offset, and the first-load hash
      // effect runs only on mount. Re-run the same offset scroll here.
      const id = window.location.hash.replace(/^#/, "");
      if (route.page === "home" && id) {
        requestAnimationFrame(() => {
          const el = document.getElementById(id);
          if (el) {
            const y = el.getBoundingClientRect().top + window.scrollY - headerOffset();
            window.scrollTo({ top: y, behavior: scrollBehavior() });
          }
        });
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Keep the tab title correct after client-side navigation (and back/forward).
  // Derived from the SAME pageTitle the server injects, so they cannot diverge.
  useEffect(() => {
    const articleTitle =
      route.page === "article" ? (getArticle(route.slug) || {}).title : undefined;
    document.title = pageTitle(route, {
      siteName: SITE.name,
      articleTitle,
    });
  }, [route]);

  // Move focus to the main region on a full page change (skip first render and
  // in-page section scrolls, which manage their own scroll position).
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    if (route.page === "home" && route.section) return;
    if (mainRef.current) mainRef.current.focus({ preventScroll: true });
  }, [route]);

  // Scroll-spy (homepage only): observe the home sections against a thin band
  // just below the sticky header and highlight the one crossing it. Only
  // "mathimata" maps to a nav item; the others simply leave the nav
  // unhighlighted (like the carousel/intro region).
  useEffect(() => {
    if (route.page !== "home") { setActiveSection(null); return; }
    const sections = HOME_SECTION_IDS
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    if (!sections.length) return;
    const latest = new Map();
    const io = new IntersectionObserver(
      (entries) => {
        const bandTop = window.innerHeight * 0.15;
        for (const e of entries) {
          latest.set(e.target.id, {
            id: e.target.id,
            ratio: e.isIntersecting ? Math.max(e.intersectionRatio, 1e-6) : 0,
            top: e.boundingClientRect.top - bandTop,
          });
        }
        setActiveSection(pickActiveSection([...latest.values()], HOME_SECTION_IDS));
      },
      { rootMargin: "-15% 0px -80% 0px" }
    );
    sections.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [route.page]);

  // On first load, honor a #section hash (e.g. /#mathimata shared as a link).
  useEffect(() => {
    const id = window.location.hash.replace(/^#/, "");
    if (!id) return;
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) {
        const y = el.getBoundingClientRect().top + window.scrollY - headerOffset();
        window.scrollTo({ top: y, behavior: scrollBehavior() });
      }
    });
  }, []);

  // Mirror the scroll-spy into the URL: as each home section crosses the band,
  // replace (never push — scrolling must not spam the back button) the #section
  // in the address bar, so the URL always names the section in view and any of
  // them is copyable as a deep link; cleared to "/" at the very top. The first
  // run on entering the home route is skipped so a deep-link hash (/#mathimata)
  // is not wiped before the observer confirms it.
  const hashSyncArmed = useRef(false);
  useEffect(() => {
    if (route.page !== "home") { hashSyncArmed.current = false; return; }
    if (!hashSyncArmed.current) { hashSyncArmed.current = true; return; }
    // Preserve any query string (?utm_source, ?fbclid) — rebuilding the URL from
    // pathname + hash alone would erase it on the first scroll-spy update, before
    // anything could read it.
    const search = window.location.search;
    const targetUrl = "/" + search + (activeSection ? "#" + activeSection : "");
    if (window.location.pathname + window.location.search + window.location.hash !== targetUrl) {
      window.history.replaceState(window.history.state, "", targetUrl);
    }
  }, [route.page, activeSection]);

  const navigate = useCallback((next, opts = {}) => {
    const targetPath = routeToPath(next).split("#")[0] || "/";
    // Preserve the #section for home-section targets so every nav control
    // (desktop nav, mobile menu, "back to Νέα" links — anything routed through
    // here) yields a copyable deep link, e.g. "Μαθήματα" → /#mathimata.
    const targetHash = next.page === "home" && next.section ? "#" + next.section : "";
    // Carry the query string across SPA navigations (like the scroll-spy URL
    // sync does), so ?utm/?fbclid params survive until a full page load.
    const search = window.location.search;
    const targetUrl = targetPath + search + targetHash;
    const stateData = opts.from !== undefined ? { from: opts.from } : {};
    const currentUrl = window.location.pathname + window.location.search + window.location.hash;
    if (currentUrl !== targetUrl) {
      window.history.pushState(stateData, "", targetUrl);
    } else if (opts.from !== undefined) {
      window.history.replaceState(stateData, "", targetUrl);
    }
    setRoute(next);

    if (next.page === "home" && next.section) {
      requestAnimationFrame(() => {
        const el = document.getElementById(next.section);
        if (el) {
          const y = el.getBoundingClientRect().top + window.scrollY - headerOffset();
          window.scrollTo({ top: y, behavior: scrollBehavior() });
        }
      });
    } else if (next.page === "home" && !next.section) {
      window.scrollTo({ top: 0, behavior: scrollBehavior() });
    }
  }, []);

  return (
    <>
      <Header route={route} navigate={navigate} activeSection={activeSection} />
      <main id="main-content" ref={mainRef} tabIndex={-1}>
        {route.page === "home" && <HomePage navigate={navigate} />}
        {route.page === "school" && <SchoolPage navigate={navigate} />}
        {route.page === "teachers" && <TeachersPage navigate={navigate} />}
        {route.page === "competitions" && <CompetitionsPage navigate={navigate} />}
        {route.page === "contact" && <ContactPage navigate={navigate} />}
        {route.page === "news-list" && <NewsListPage navigate={navigate} />}
        {route.page === "article" && <Article slug={route.slug} navigate={navigate} />}
        {route.page === "not-found" && <NotFound navigate={navigate} />}
      </main>
      <Footer />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
