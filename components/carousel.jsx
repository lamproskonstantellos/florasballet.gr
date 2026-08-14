/* global React, SITE, Picture, Icon */

/* ============================================================
   HERO CAROUSEL
   - 4 slides from SITE.carousel, crossfaded via opacity.
   - Autoplay ~5s; pauses on hover/focus and via a persistent
     play/pause button; stops entirely under prefers-reduced-motion
     (tracked live, so toggling the OS setting takes effect at once).
   - Controls: prev/next arrows, a play/pause toggle and clickable
     dots, full keyboard support, swipe on touch. No external library.
   - Accessible: labelled carousel group, per-slide labels,
     aria-current dots, live region "polite" only while not
     autoplaying so a user-initiated slide change is announced.
   - Only the current and next slide's images are mounted, so the
     later heroes are not all fetched on first paint.
   ============================================================ */

function Carousel() {
  const { useState, useEffect, useRef, useCallback } = React;
  const slides = (typeof SITE !== "undefined" && SITE.carousel) || [];
  const count = slides.length;

  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);      // transient hover/focus pause
  const [userPaused, setUserPaused] = useState(false); // persistent toggle (WCAG 2.2.2)
  const [reduceMotion, setReduceMotion] = useState(false);
  const [loaded, setLoaded] = useState(() => new Set([0]));
  const touchStartX = useRef(null);

  const goTo = useCallback((i) => setIndex(((i % count) + count) % count), [count]);
  const next = useCallback(() => setIndex((i) => (i + 1) % count), [count]);
  const prev = useCallback(() => setIndex((i) => (i - 1 + count) % count), [count]);

  // Track the reduced-motion preference live — the CSS half reacts to a
  // mid-session toggle, so the autoplay half must too.
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(mq.matches);
    apply();
    if (mq.addEventListener) mq.addEventListener("change", apply);
    else if (mq.addListener) mq.addListener(apply);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", apply);
      else if (mq.removeListener) mq.removeListener(apply);
    };
  }, []);

  const autoplaying = !hovered && !userPaused && !reduceMotion && count > 1;

  // Autoplay. `index` is a dependency so a manual move (dot, arrow, swipe)
  // restarts the interval instead of inheriting the previous slide's remainder.
  useEffect(() => {
    if (!autoplaying) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), 5000);
    return () => clearInterval(id);
  }, [autoplaying, count, index]);

  // Mount a slide's image once it becomes current or the immediate next one, so
  // slides 3–4 are deferred past first paint (only slide 1 is eager/preloaded).
  useEffect(() => {
    setLoaded((prev) => {
      if (prev.has(index) && prev.has((index + 1) % count)) return prev;
      const n = new Set(prev);
      n.add(index);
      n.add((index + 1) % count);
      return n;
    });
  }, [index, count]);

  const onKeyDown = (e) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); next(); }
  };

  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) { dx < 0 ? next() : prev(); }
    touchStartX.current = null;
  };

  if (!count) return null;

  return (
    <section
      className="carousel"
      role="group"
      aria-roledescription="carousel"
      aria-label="Φωτογραφίες της σχολής"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      onKeyDown={onKeyDown}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="carousel-viewport" aria-live={autoplaying ? "off" : "polite"}>
        {slides.map((src, i) => (
          <div
            key={i}
            className={"carousel-slide" + (i === index ? " active" : "")}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} από ${count}`}
            aria-hidden={i === index ? undefined : true}
          >
            {loaded.has(i) ? (
              <Picture
                src={src}
                alt=""
                width="1600"
                height="900"
                loading={i === 0 ? "eager" : "lazy"}
                fetchPriority={i === 0 ? "high" : undefined}
                sizes="100vw"
              />
            ) : null}
          </div>
        ))}

        <div className="carousel-scrim" aria-hidden="true" />

        {count > 1 && (
          <>
            <button
              type="button"
              className="carousel-arrow carousel-prev"
              aria-label="Προηγούμενη διαφάνεια"
              onClick={prev}
            >
              <Icon.arrowLeft style={{ width: 20, height: 20 }} />
            </button>
            <button
              type="button"
              className="carousel-arrow carousel-next"
              aria-label="Επόμενη διαφάνεια"
              onClick={next}
            >
              <Icon.arrowRight style={{ width: 20, height: 20 }} />
            </button>
            <button
              type="button"
              className="carousel-playpause"
              aria-label={userPaused ? "Αναπαραγωγή προβολής" : "Παύση προβολής"}
              aria-pressed={userPaused ? "true" : "false"}
              onClick={() => setUserPaused((p) => !p)}
            >
              {userPaused
                ? <Icon.play style={{ width: 16, height: 16 }} />
                : <Icon.pause style={{ width: 16, height: 16 }} />}
            </button>

            <div className="carousel-dots" role="group" aria-label="Επιλογή διαφάνειας">
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className={"carousel-dot" + (i === index ? " active" : "")}
                  aria-label={`Διαφάνεια ${i + 1}`}
                  aria-current={i === index ? "true" : undefined}
                  onClick={() => goTo(i)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

window.Carousel = Carousel;
