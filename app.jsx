/* global React, ReactDOM, SITE, SCHOOL, Icon, Carousel,
   parseRoute, routeToPath, pageTitle, getArticle, handleAnchorClick,
   pickActiveSection,
   HomeIntro, WhyUs, Courses, Contact,
   NewsPreview, NewsListPage, Article,
   SchoolPage, TeachersPage, CompetitionsPage */

const { useState, useEffect, useCallback, useRef } = React;

const HEADER_OFFSET = 100;

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
    const onKey = (e) => { if (e.key === "Escape") setDropdownOpen(false); };
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

  const go = (e, target) => {
    handleAnchorClick(e, navigate, target);
    setDropdownOpen(false);
    setMobileOpen(false);
  };

  const TEACH = { page: "teachers" };
  const ABOUT = { page: "school" };
  const MATH = { page: "home", section: "mathimata" };
  const COMP = { page: "competitions" };
  const NEWS = { page: "news-list" };
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
            onMouseEnter={() => setDropdownOpen(true)}
            onMouseLeave={() => setDropdownOpen(false)}
          >
            <button
              type="button"
              className="nav-dropdown-trigger"
              aria-haspopup="true"
              aria-expanded={dropdownOpen ? "true" : "false"}
              onClick={() => setDropdownOpen((o) => !o)}
            >
              Η Σχολή <Icon.chevron className="chev" style={{ width: 13, height: 13 }} />
            </button>
            <div className="dropdown-menu" role="menu">
              <a
                role="menuitem"
                className={route.page === "school" ? "active" : ""}
                href={routeToPath(ABOUT)}
                onClick={(e) => go(e, ABOUT)}
              >
                Εμείς
              </a>
              <a
                role="menuitem"
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
            className={"nav-link" + (newsActive ? " active" : "")}
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
              <img src={SITE.logoNav} alt={SITE.name} width="550" height="270" />
              <button
                type="button"
                className="mobile-close"
                aria-label="Κλείσιμο μενού"
                onClick={() => setMobileOpen(false)}
              >
                <Icon.close style={{ width: 24, height: 24 }} />
              </button>
            </div>

            <button
              type="button"
              className="mobile-sub-trigger"
              aria-expanded={mobileSubOpen ? "true" : "false"}
              onClick={() => setMobileSubOpen((o) => !o)}
            >
              Η Σχολή <Icon.chevron className="chev" style={{ width: 15, height: 15 }} />
            </button>
            <div className={"mobile-sub" + (mobileSubOpen ? " open" : "")}>
              <a href={routeToPath(ABOUT)} onClick={(e) => go(e, ABOUT)}>Εμείς</a>
              <a href={routeToPath(TEACH)} onClick={(e) => go(e, TEACH)}>Διδάσκοντες</a>
            </div>

            <a className="mobile-link" href={routeToPath(MATH)} onClick={(e) => go(e, MATH)}>Μαθήματα</a>
            <a className="mobile-link" href={routeToPath(COMP)} onClick={(e) => go(e, COMP)}>Διαγωνισμοί</a>
            <a className="mobile-link" href={routeToPath(NEWS)} onClick={(e) => go(e, NEWS)}>Νέα &amp; Ανακοινώσεις</a>
            <a className="mobile-cta" href={routeToPath(CONTACT)} onClick={(e) => go(e, CONTACT)}>Επικοινωνία</a>
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
          <p>{SITE.address.street}<br />{SITE.address.postalCode} {SITE.address.area}</p>
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
    const onPop = () => setRoute(parseRoute(window.location.pathname));
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
      tagline: SITE.tagline,
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
        const y = el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET;
        window.scrollTo({ top: y, behavior: "smooth" });
      }
    });
  }, []);

  const navigate = useCallback((next, opts = {}) => {
    const targetPath = routeToPath(next).split("#")[0] || "/";
    const stateData = opts.from !== undefined ? { from: opts.from } : {};
    if (window.location.pathname !== targetPath) {
      window.history.pushState(stateData, "", targetPath);
    } else if (opts.from !== undefined) {
      window.history.replaceState(stateData, "", targetPath);
    }
    setRoute(next);

    if (next.page === "home" && next.section) {
      requestAnimationFrame(() => {
        const el = document.getElementById(next.section);
        if (el) {
          const y = el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET;
          window.scrollTo({ top: y, behavior: "smooth" });
        }
      });
    } else if (next.page === "home" && !next.section) {
      window.scrollTo({ top: 0, behavior: "smooth" });
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
