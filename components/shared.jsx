/* global React, Icon, routeToPath */

/* ============================================================
   SHARED HELPERS & SMALL UI PRIMITIVES
   - asset:         normalize relative asset paths (cover/photos)
                    so they resolve from site root regardless of
                    the current SPA URL (e.g. /nea/<slug>)
   - handleAnchorClick: SPA navigation that respects modifier clicks
   - renderInline:  inline **bold** parser for body paragraphs
   - useReveal:     IntersectionObserver-driven reveal hook
   - SectionHeader: optional kicker + <h2> + optional right action
   - ViewAllLink:   "Όλα τα νέα →" CTA
   (routeToPath lives in routes.js, shared with the server.)
   ============================================================ */

function asset(path) {
  if (!path) return "";
  if (/^(https?:|\/)/.test(path)) return path;
  return "/" + path;
}

function handleAnchorClick(e, navigate, route, opts) {
  // Let the browser handle modifier-clicks and non-left clicks normally.
  if (e.defaultPrevented) return;
  if (e.button !== undefined && e.button !== 0) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  navigate(route, opts);
}

function renderInline(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return <strong key={i}>{p.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}

function useReveal() {
  const [visible, setVisible] = React.useState(new Set());
  React.useEffect(() => {
    const items = document.querySelectorAll("[data-reveal]");
    if (!items.length) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          const k = e.target.dataset.reveal;
          setVisible((prev) => { const n = new Set(prev); n.add(k); return n; });
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    items.forEach((it) => io.observe(it));
    return () => io.disconnect();
  }, []);
  return visible;
}

function SectionHeader({ kicker, title, action, center }) {
  return (
    <div className={"section-label" + (center ? " section-center" : "")}>
      <div className="section-label-text">
        {kicker ? <span className="section-kicker">{kicker}</span> : null}
        <h2>{title}</h2>
      </div>
      {action ? <div className="section-label-action">{action}</div> : null}
    </div>
  );
}

function ViewAllLink({ href, onClick, label = "Όλα τα νέα" }) {
  return (
    <a className="view-all" href={href} onClick={onClick}>
      {label} <Icon.arrowRight style={{ width: 13, height: 13 }} />
    </a>
  );
}

Object.assign(window, {
  asset, handleAnchorClick, renderInline,
  useReveal, SectionHeader, ViewAllLink,
});
