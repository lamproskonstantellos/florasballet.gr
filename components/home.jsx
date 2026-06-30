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
      <p className="home-eyebrow">40 χρόνια ρυθμός, κίνηση &amp; αγάπη για τον χορό</p>
      <h1>{SCHOOL.h1}</h1>
      <p className="sub">{SCHOOL.h1Sub}</p>
    </div>
  );
}

// Two wide frames stacked one above the other — both keep their natural
// landscape framing (no tall vertical crop that would lose the scene).
// (misc-2 is the black-and-white shot, now reused as the news article cover,
// so it is intentionally dropped here.)
const WHYUS_PHOTOS = [
  { src: "/images/misc/misc-1.jpg", w: 800, h: 533 },
  { src: "/images/misc/misc-3.jpg", w: 800, h: 533 },
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
              className={`whyus-photo reveal ${visible.has(`whyph-${i}`) ? "in" : ""}`}
              data-reveal={`whyph-${i}`}
              style={{ transitionDelay: `${i * 90}ms` }}
              key={i}
            >
              <Picture src={ph.src} alt="" width={ph.w} height={ph.h} />
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
      <SectionHeader center as="h1" kicker="Ελάτε να χορέψουμε" title="Επικοινωνία" />
      <div className="contact-shell">
        <div className="contact-info">
          <ContactInfoRow icon={Icon.phone} label="Τηλέφωνα">
            {SITE.phones.map((p) => (
              <div className="contact-line" key={p.tel}>
                <a href={`tel:${p.tel}`}>{p.display}</a>
              </div>
            ))}
          </ContactInfoRow>

          <ContactInfoRow icon={Icon.mail} label="Email">
            <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
          </ContactInfoRow>

          <ContactInfoRow icon={Icon.clock} label="Ώρες λειτουργίας">
            {SITE.hours.map((h) => (
              <div className="hours-line" key={h.label}>
                <span className="day">{h.label}</span>
                <span className="time">{h.time}</span>
              </div>
            ))}
          </ContactInfoRow>

          <ContactInfoRow icon={Icon.pin} label="Διεύθυνση">
            {SITE.address.street}, {SITE.address.postalCode} {SITE.address.area}
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
            title={`Χάρτης: ${SITE.address.street}, ${SITE.address.postalCode} ${SITE.address.area}`}
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
