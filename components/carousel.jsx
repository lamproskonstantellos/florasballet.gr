/* global React, SITE, Picture, Icon */

/* ============================================================
   HERO CAROUSEL
   - 4 slides from SITE.carousel, crossfaded via opacity.
   - Autoplay ~5s; pauses on hover/focus; stops entirely under
     prefers-reduced-motion.
   - Controls: prev/next arrows + clickable dots, full keyboard
     support, swipe on touch. No external library.
   - Accessible: labelled carousel group, per-slide labels,
     aria-current dots, live region kept "off" while autoplaying.
   ============================================================ */

function Carousel() {
  const { useState, useEffect, useRef, useCallback } = React;
  const slides = (typeof SITE !== "undefined" && SITE.carousel) || [];
  const count = slides.length;

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef(null);

  const goTo = useCallback((i) => setIndex(((i % count) + count) % count), [count]);
  const next = useCallback(() => setIndex((i) => (i + 1) % count), [count]);
  const prev = useCallback(() => setIndex((i) => (i - 1 + count) % count), [count]);

  // Autoplay — disabled when paused, single-slide, or reduced-motion.
  useEffect(() => {
    if (paused || count <= 1) return;
    const mq = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq && mq.matches) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), 5000);
    return () => clearInterval(id);
  }, [paused, count]);

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
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={onKeyDown}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="carousel-viewport" aria-live="off">
        {slides.map((src, i) => (
          <div
            key={i}
            className={"carousel-slide" + (i === index ? " active" : "")}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} από ${count}`}
            aria-hidden={i === index ? undefined : true}
          >
            <Picture
              src={src}
              alt=""
              width="1600"
              height="900"
              loading={i === 0 ? "eager" : "lazy"}
              fetchPriority={i === 0 ? "high" : undefined}
              sizes="100vw"
            />
          </div>
        ))}

        <div className="carousel-scrim" aria-hidden="true" />

        {count > 1 && (
          <div className="carousel-dots" role="tablist" aria-label="Επιλογή διαφάνειας">
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  className={"carousel-dot" + (i === index ? " active" : "")}
                  aria-label={`Διαφάνεια ${i + 1}`}
                  aria-selected={i === index ? "true" : "false"}
                  onClick={() => goTo(i)}
                />
              ))}
          </div>
        )}
      </div>
    </section>
  );
}

window.Carousel = Carousel;
