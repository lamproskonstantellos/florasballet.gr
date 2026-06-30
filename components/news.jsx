/* global React, Icon, Picture, SITE, getRecentNews, getArticle, LIMITS,
   asset, routeToPath, handleAnchorClick, shareLinks,
   useReveal, renderInline, SectionHeader, ViewAllLink */

/* ============================================================
   ΝΕΑ & ΑΝΑΚΟΙΝΩΣΕΙΣ
   - NewsCard:     reusable preview card
   - NewsPreview:  homepage section, capped at LIMITS (id "nea")
   - NewsListPage: /nea full list
   - Article:      /nea/<slug> full article view
   ============================================================ */

function NewsCard({ article, index = 0, navigate, revealKey, isVisible, from }) {
  const route = { page: "article", slug: article.slug };
  return (
    <a
      className={`news-card reveal ${isVisible ? "in" : ""}`}
      data-reveal={revealKey}
      style={{ transitionDelay: `${index * 80}ms` }}
      href={routeToPath(route)}
      onClick={(e) => handleAnchorClick(e, navigate, route, { from })}
    >
      <div className={"cover" + (article.coverAlign === "top" ? " cover-align-top" : "")}>
        {article.cover
          ? <Picture src={asset(article.cover)} alt={article.title} width="640" height="400" />
          : <div className="ph">[ news/{article.slug}/cover.jpg ]</div>}
      </div>
      <div className="body">
        <div className="meta">
          <span className="meta-date">{article.dateLabel}</span>
          {article.location ? <span className="meta-loc">{article.location}</span> : null}
        </div>
        <h3>{article.title}</h3>
        <p>{article.excerpt}</p>
        <span className="read">
          Διαβάστε περισσότερα <Icon.arrowRight style={{ width: 13, height: 13 }} />
        </span>
      </div>
    </a>
  );
}

function NewsPreview({ navigate }) {
  const visible = useReveal();
  const limit = LIMITS.newsPreview;
  const items = getRecentNews(limit);
  const showViewAll = getRecentNews().length > limit;

  if (items.length === 0) return null;

  return (
    <section className="block" id="nea">
      <SectionHeader center kicker="Τι νέο υπάρχει" title="Νέα & Ανακοινώσεις" />
      <div className="news-grid">
        {items.map((n, i) => (
          <NewsCard
            key={n.slug}
            article={n}
            index={i}
            navigate={navigate}
            revealKey={`news-${i}`}
            isVisible={visible.has(`news-${i}`)}
            from="home"
          />
        ))}
      </div>
      {showViewAll && (
        <div style={{ textAlign: "center", marginTop: 30 }}>
          <ViewAllLink
            href="/nea"
            onClick={(e) => handleAnchorClick(e, navigate, { page: "news-list" })}
          />
        </div>
      )}
    </section>
  );
}

function NewsListPage({ navigate }) {
  const visible = useReveal();
  const items = getRecentNews();

  React.useEffect(() => { window.scrollTo({ top: 0 }); }, []);

  const backRoute = { page: "home", section: "nea" };

  return (
    <div className="page list-page">
      <a
        className="back-link"
        href={routeToPath(backRoute)}
        onClick={(e) => handleAnchorClick(e, navigate, backRoute)}
      >
        <Icon.arrowLeft style={{ width: 14, height: 14 }} /> Επιστροφή στην αρχική
      </a>
      <header className="page-head">
        <span className="section-kicker">Τι νέο υπάρχει</span>
        <h1>Νέα &amp; Ανακοινώσεις</h1>
      </header>
      {items.length === 0 ? (
        <p className="list-empty">Δεν υπάρχουν ακόμη ανακοινώσεις.</p>
      ) : (
        <div className="news-grid">
          {items.map((n, i) => (
            <NewsCard
              key={n.slug}
              article={n}
              index={i}
              navigate={navigate}
              revealKey={`news-list-${i}`}
              isVisible={visible.has(`news-list-${i}`)}
              from="news-list"
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Lightbox({ src, alt, onClose }) {
  const closeRef = React.useRef(null);

  React.useEffect(() => {
    const triggerEl = document.activeElement;
    const onKey = (e) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "Tab") {
        e.preventDefault();
        if (closeRef.current) closeRef.current.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (closeRef.current) closeRef.current.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (triggerEl && typeof triggerEl.focus === "function") triggerEl.focus();
    };
  }, [onClose]);

  return (
    <div
      className="lightbox"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Προβολή φωτογραφίας"
    >
      <button
        type="button"
        className="lightbox-close"
        ref={closeRef}
        aria-label="Κλείσιμο"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      >
        ×
      </button>
      <img
        className="lightbox-img"
        src={src}
        alt={alt || ""}
        loading="eager"
        decoding="async"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function ArticleShare({ article }) {
  // Canonical URL from config — never window.location, which on this SPA can
  // carry transient state (hash, history entries) that must not be shared.
  const url = SITE.url + "/nea/" + article.slug;
  const [copied, setCopied] = React.useState(false);
  const copyTimer = React.useRef(null);

  React.useEffect(() => () => clearTimeout(copyTimer.current), []);

  const markCopied = () => {
    setCopied(true);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1800);
  };

  const fallbackCopy = () => {
    const ta = document.createElement("textarea");
    ta.value = url;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    document.body.removeChild(ta);
    if (ok) markCopied();
  };

  const copyUrl = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(markCopied, fallbackCopy);
    } else {
      fallbackCopy();
    }
  };

  const canNativeShare = typeof navigator !== "undefined" && !!navigator.share;
  const nativeShare = () => {
    navigator.share({ title: article.title, url }).catch(() => {});
  };

  return (
    <div className="article-share">
      <span className="share-label">Κοινοποίηση:</span>
      <a
        href={shareLinks(url).facebook}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Κοινοποίηση στο Facebook"
      >
        <Icon.facebook style={{ width: 14, height: 14 }} /> Facebook
      </a>
      <button type="button" className={copied ? "copied" : ""} onClick={copyUrl}>
        {copied
          ? <Icon.check style={{ width: 14, height: 14 }} />
          : <Icon.link style={{ width: 14, height: 14 }} />}
        {copied ? "Αντιγράφηκε!" : "Αντιγραφή συνδέσμου"}
      </button>
      {canNativeShare && (
        <button type="button" onClick={nativeShare}>
          <Icon.arrowUR style={{ width: 14, height: 14 }} /> Κοινοποίηση
        </button>
      )}
      <span className="sr-only" aria-live="polite">
        {copied ? "Ο σύνδεσμος αντιγράφηκε" : ""}
      </span>
    </div>
  );
}

function Article({ slug, navigate }) {
  const article = React.useMemo(() => getArticle(slug), [slug]);
  const [lightboxSrc, setLightboxSrc] = React.useState(null);
  const closeLightbox = React.useCallback(() => setLightboxSrc(null), []);

  React.useEffect(() => { window.scrollTo({ top: 0 }); }, [slug]);

  const from = window.history.state?.from;
  const backRoute = from === "home"
    ? { page: "home", section: "nea" }
    : { page: "news-list" };
  const backLabel = from === "home" ? "Επιστροφή στην αρχική" : "Επιστροφή στα Νέα";
  const backLink = (
    <a
      className="back-link"
      href={routeToPath(backRoute)}
      onClick={(e) => handleAnchorClick(e, navigate, backRoute)}
    >
      <Icon.arrowLeft style={{ width: 14, height: 14 }} /> {backLabel}
    </a>
  );

  if (!article) {
    return (
      <div className="page article">
        {backLink}
        <p style={{ color: "var(--muted)" }}>Το άρθρο δεν βρέθηκε.</p>
      </div>
    );
  }

  return (
    <div className="page article">
      {backLink}
      <div className="article-meta">
        <span className="meta-date">{article.dateLabel}</span>
        {article.location ? <span className="meta-loc">{article.location}</span> : null}
      </div>
      <h1>{article.title}</h1>
      {article.cover && (
        <div className={"article-cover" + (article.coverAlign === "top" ? " cover-align-top" : "")}>
          <Picture
            src={asset(article.cover)}
            alt={article.title}
            width="1280"
            height="720"
            loading="eager"
          />
        </div>
      )}
      <div className="article-body">
        {article.body.map((p, i) => (
          <p key={i}>{renderInline(p)}</p>
        ))}
      </div>
      {article.video && (
        <div className="article-video">
          <video
            controls
            preload="metadata"
            poster={article.poster ? asset(article.poster) : undefined}
          >
            <source src={asset(article.video)} type="video/mp4" />
          </video>
        </div>
      )}
      {article.photos && article.photos.length > 0 && (
        <div className="article-gallery">
          {article.photos.map((photo, i) => {
            const photoSrc = typeof photo === "string" ? photo : photo.src;
            const alignTop = typeof photo === "object" && photo.align === "top";
            const photoAlt = `Φωτογραφία ${i + 1} από «${article.title}»`;
            const open = () => setLightboxSrc({ src: asset(photoSrc), alt: photoAlt });
            return (
              <div
                className={"photo" + (alignTop ? " photo-align-top" : "")}
                key={i}
                role="button"
                tabIndex={0}
                aria-label={`Άνοιγμα: ${photoAlt}`}
                onClick={open}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    open();
                  }
                }}
              >
                <Picture src={asset(photoSrc)} alt={photoAlt} width="800" height="600" />
              </div>
            );
          })}
        </div>
      )}
      {lightboxSrc && (
        <Lightbox src={lightboxSrc.src} alt={lightboxSrc.alt} onClose={closeLightbox} />
      )}
      <ArticleShare article={article} />
      {article.sources && article.sources.length > 0 && (
        <div className="article-sources">
          Πηγές:{" "}
          {article.sources.map((s, i) => (
            <React.Fragment key={i}>
              {i > 0 && ", "}
              <a href={s.href} target="_blank" rel="noopener noreferrer">{s.label}</a>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { NewsCard, NewsPreview, NewsListPage, Article });
