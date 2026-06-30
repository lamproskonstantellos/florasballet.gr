/* global React, SCHOOL, renderInline, useReveal */

/* ============================================================
   Η ΣΧΟΛΗ › ΕΜΕΙΣ  (/i-scholi)
   Identity (lead) → History → Philosophy → Vision → Goals.
   ============================================================ */

function SchoolPage() {
  const visible = useReveal();
  React.useEffect(() => { window.scrollTo({ top: 0 }); }, []);

  return (
    <div className="page school-page">
      <header className="page-head">
        <span className="section-kicker">Η Σχολή</span>
        <h1>Εμείς</h1>
      </header>

      <p className="school-lead">{renderInline(SCHOOL.intro)}</p>

      <section className="school-block">
        <h2 className="school-h2">Ιστορία</h2>
        <div className="prose">
          {SCHOOL.history.map((p, i) => (
            <p key={i}>{renderInline(p)}</p>
          ))}
        </div>
      </section>

      <section className="school-block">
        <h2 className="school-h2">Φιλοσοφία</h2>
        <div className="prose">
          <p>{renderInline(SCHOOL.philosophy)}</p>
        </div>
      </section>

      <section className="school-block">
        <h2 className="school-h2">Όραμα</h2>
        <div className="prose">
          <p>{renderInline(SCHOOL.vision)}</p>
        </div>
      </section>

      <section className="school-block">
        <h2 className="school-h2">Στόχος</h2>
        <div className="school-goals">
          {SCHOOL.goals.map((g, i) => (
            <div
              className={`goal-card reveal ${visible.has(`goal-${i}`) ? "in" : ""}`}
              data-reveal={`goal-${i}`}
              style={{ transitionDelay: `${i * 70}ms` }}
              key={i}
            >
              <h3>{g.title}</h3>
              <p>{renderInline(g.text)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

window.SchoolPage = SchoolPage;
