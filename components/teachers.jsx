/* global React, TEACHERS, Picture, asset, renderInline */

/* ============================================================
   ΔΙΔΑΣΚΟΝΤΕΣ  (/didaskontes)
   Renders the TEACHERS array (data.js). Append a teacher object
   there and a new card appears — nothing here is hardcoded to one.
   ============================================================ */

function TeacherCard({ teacher }) {
  return (
    <article className="teacher-card">
      <div className="teacher-photo">
        <Picture src={asset(teacher.image)} alt={teacher.alt} width="1072" height="1500" />
      </div>
      <div className="teacher-info">
        <h2 className="teacher-name">{teacher.name}</h2>
        <p className="teacher-role">{teacher.role}</p>
        <div className="teacher-bio">
          {teacher.bio.map((p, i) => (
            <p key={i}>{renderInline(p)}</p>
          ))}
        </div>
        {teacher.highlights && teacher.highlights.length > 0 && (
          <div className="teacher-highlights">
            <h3>{teacher.highlightsTitle || "Διακρίσεις"}</h3>
            {teacher.highlights.map((h, i) => (
              <div className="highlight" key={i}>
                <span className="dot" aria-hidden="true" />
                <p>
                  <strong>{h.label}:</strong> {renderInline(h.text)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function TeachersPage() {
  React.useEffect(() => { window.scrollTo({ top: 0 }); }, []);
  return (
    <div className="page teachers-page">
      <header className="page-head">
        <span className="section-kicker">Η ομάδα μας</span>
        <h1>Διδάσκοντες</h1>
      </header>
      {TEACHERS.map((t, i) => (
        <TeacherCard teacher={t} key={i} />
      ))}
    </div>
  );
}

Object.assign(window, { TeacherCard, TeachersPage });
