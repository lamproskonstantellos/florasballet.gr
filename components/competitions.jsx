/* global React, SITE, COMPETITIONS, useReveal */

/* ============================================================
   ΔΙΑΓΩΝΙΣΜΟΙ  (/diagonismoi)
   A scannable timeline grouped by year (newest first); each year
   holds one or more competitions, each with its placements.
   Data lives in COMPETITIONS (data.js) — easy to extend.
   ============================================================ */

function CompetitionsPage() {
  const visible = useReveal();
  React.useEffect(() => { window.scrollTo({ top: 0 }); }, []);
  const instagram = SITE.socialLinks[1];
  // Derive the visible handle from the URL so the "single source of truth" can
  // never leave a stale handle on screen.
  const instagramHandle = "@" + instagram.replace(/\/+$/, "").split("/").pop();

  return (
    <div className="page comp-page">
      <header className="page-head">
        <span className="section-kicker">Βραβεύσεις & διακρίσεις</span>
        <h1>Διαγωνισμοί</h1>
      </header>

      <p className="comp-intro">{COMPETITIONS.intro}</p>

      {COMPETITIONS.years.map((y, yi) => (
        <div
          className={`comp-year reveal ${visible.has(`year-${yi}`) ? "in" : ""}`}
          data-reveal={`year-${yi}`}
          key={y.year}
        >
          <h2 className="comp-year-label">{y.year}</h2>
          <div className="comp-events">
            {y.events.map((ev, ei) => (
              <div className="comp-event" key={ei}>
                <h3 className="comp-event-name">{ev.name}</h3>
                <ul className="comp-results" role="list">
                  {ev.results.map((r, ri) => (
                    <li key={ri}>{r}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ))}

      <p className="comp-note">
        Περισσότερες φωτογραφίες από τους διαγωνισμούς στο Instagram:{" "}
        <a href={instagram} target="_blank" rel="noopener noreferrer">{instagramHandle}</a>.
      </p>
    </div>
  );
}

window.CompetitionsPage = CompetitionsPage;
