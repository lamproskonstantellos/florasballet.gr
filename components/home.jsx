/* global React, SITE, SCHOOL, WHY_US, COURSES, Icon, Picture,
   asset, renderInline, useReveal, SectionHeader */

/* ============================================================
   HOME SECTIONS
   - HomeIntro:  title block (H1 + subtitle) under the carousel
   - WhyUs:      «Γιατί εμάς» — 6 points + decorative photos
   - Courses:    «Τα μαθήματα» — 4 photo cards (id "mathimata")
   - Contact:    «Επικοινωνία» — info + map + social (id "epikoinonia")
   (NewsPreview lives in components/news.jsx)
   ============================================================ */

function HomeIntro() {
  return (
    <div className="home-intro">
      <h1>{SCHOOL.h1}</h1>
      <p className="sub">{SCHOOL.h1Sub}</p>
    </div>
  );
}

const WHYUS_PHOTOS = [
  { src: "/images/misc/misc-1.jpg", cls: "tall" },
  { src: "/images/misc/misc-2.jpg", cls: "" },
  { src: "/images/misc/misc-3.jpg", cls: "" },
];

function WhyUs() {
  const visible = useReveal();
  return (
    <section className="block" id="giati-emas">
      <SectionHeader center kicker="Η σχολή μας" title="Γιατί εμάς" />
      <div className="whyus-shell">
        <ol className="whyus-points">
          {WHY_US.map((t, i) => (
            <li
              className={`whyus-point reveal ${visible.has(`why-${i}`) ? "in" : ""}`}
              data-reveal={`why-${i}`}
              style={{ transitionDelay: `${i * 70}ms` }}
              key={i}
            >
              <span className="mark" aria-hidden="true">{i + 1}</span>
              <p>{renderInline(t)}</p>
            </li>
          ))}
        </ol>
        <div className="whyus-photos">
          {WHYUS_PHOTOS.map((ph, i) => (
            <div
              className={`whyus-photo ${ph.cls} reveal ${visible.has(`whyph-${i}`) ? "in" : ""}`}
              data-reveal={`whyph-${i}`}
              style={{ transitionDelay: `${i * 90}ms` }}
              key={i}
            >
              <Picture src={ph.src} alt="" width="640" height="853" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Courses() {
  const visible = useReveal();
  return (
    <section className="block" id="mathimata">
      <SectionHeader center kicker="Τμήματα για όλες τις ηλικίες" title="Τα μαθήματα" />
      <div className="courses-grid">
        {COURSES.map((c, i) => (
          <article
            className={`course-card reveal ${visible.has(`course-${i}`) ? "in" : ""}`}
            data-reveal={`course-${i}`}
            style={{ transitionDelay: `${i * 80}ms` }}
            key={i}
          >
            <div className="course-media">
              <Picture src={asset(c.image)} alt={c.alt} width="700" height="933" />
            </div>
            <div className="course-scrim" aria-hidden="true" />
            <div className="course-body">
              <div className="course-rule" aria-hidden="true" />
              <h3>{c.title}</h3>
              <p>{renderInline(c.desc)}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ContactInfoRow({ icon: I, label, children }) {
  return (
    <div className="contact-row">
      <span className="ico-badge" aria-hidden="true">
        <I style={{ width: 21, height: 21 }} />
      </span>
      <div>
        <div className="label">{label}</div>
        <div className="value">{children}</div>
      </div>
    </div>
  );
}

function Contact() {
  const [fb, ig] = SITE.socialLinks;
  return (
    <section className="block" id="epikoinonia">
      <SectionHeader center kicker="Ελάτε να χορέψουμε" title="Επικοινωνία" />
      <div className="contact-shell">
        <div className="contact-info">
          <ContactInfoRow icon={Icon.phone} label="Τηλέφωνα">
            {SITE.phones.map((p, i) => (
              <React.Fragment key={p.tel}>
                {i > 0 ? " · " : null}
                <a href={`tel:${p.tel}`}>{p.display}</a>
              </React.Fragment>
            ))}
          </ContactInfoRow>

          <ContactInfoRow icon={Icon.mail} label="Email">
            <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
          </ContactInfoRow>

          <ContactInfoRow icon={Icon.clock} label="Ώρες λειτουργίας">
            {SITE.hours.map((h) => (
              <div key={h.label}>{h.label} · {h.time}</div>
            ))}
          </ContactInfoRow>

          <ContactInfoRow icon={Icon.pin} label="Διεύθυνση">
            {SITE.address.street}, {SITE.address.area}
          </ContactInfoRow>

          <div className="contact-social">
            <a href={fb} target="_blank" rel="noopener noreferrer" aria-label="Facebook">
              <Icon.facebook style={{ width: 20, height: 20 }} />
            </a>
            <a href={ig} target="_blank" rel="noopener noreferrer" aria-label="Instagram">
              <Icon.instagram style={{ width: 20, height: 20 }} />
            </a>
          </div>
        </div>

        <div className="contact-map">
          <iframe
            src={SITE.mapEmbed}
            title="Χάρτης: Κωνσταντινουπόλεως 322, Μενίδι (Αχαρνές)"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { HomeIntro, WhyUs, Courses, Contact });
