import dynamic from 'next/dynamic';
import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';

function getBrowserLang() {
  if (typeof navigator === 'undefined') return 'fr';
  const lang = navigator.language || navigator.languages?.[0] || 'fr';
  return lang.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

const COPY = {
  fr: {
    title: 'À propos — Interstice',
    nav: '← Faire l\'expérience',
    heading: 'Interstice',
    sub: 'Une expérience de Studio Existence',
    body: [
      'Interstice est né d\'un désir simple : créer un lien entre deux étrangers complets, sans aucune médiation visuelle, sans profil, sans identité.',
      'Deux personnes. Un geste simultané. Un espace qui n\'existe que tant que les deux choisissent de le faire exister.',
      'Le son uniquement — parce qu\'en se voyant, on juge avant même de s\'entendre. Un visage, une silhouette, une façon de s\'habiller : autant de filtres inconscients qui colorent chaque mot avant qu\'il soit prononcé. Dans l\'interstice, il n\'y a rien de tout ça. On est dans le noir complet. Ce qu\'on perçoit de l\'autre, c\'est ce qu\'il laisse entendre — sa respiration, son silence, les sons de son espace. C\'est la forme la plus nue de la présence.',
      'Le portail se ferme dès que l\'un des deux lève le doigt. Définitivement. Ce moment ne peut pas être rejoué.',
      'Pour le saisir pleinement, il faut le vivre.',
    ],
    cta: 'Entrer dans une salle',
    footer: 'studioexistence.com',
  },
  en: {
    title: 'About — Interstice',
    nav: '← Experience it',
    heading: 'Interstice',
    sub: 'An experience by Studio Existence',
    body: [
      'Interstice was born from a simple desire: to create a connection between two complete strangers — without images, without profiles, without identity.',
      'Two people. One shared gesture. A space that exists only as long as both choose to keep it alive.',
      'Sound only — because when we see each other, we judge before we even listen. A face, a posture, a way of dressing: unconscious filters that colour every word before it\'s spoken. In the interstice, none of that exists. We\'re in complete darkness. What we perceive of the other is what they let through — their breathing, their silence, the sounds of their space. It\'s the most unguarded form of presence.',
      'The portal closes the moment either person lifts their finger. Permanently. This moment cannot be replayed.',
      'To truly understand it, you have to live it.',
    ],
    cta: 'Enter a room',
    footer: 'studioexistence.com',
  },
};

function About() {
  const [lang, setLang] = useState('fr');

  useEffect(() => { setLang(getBrowserLang()); }, []);

  const t = COPY[lang];

  return (
    <>
      <Head>
        <title>{t.title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0a0a0f" />
      </Head>

      <div className="page">
        <div className="lang-toggle">
          <button className={`lang-btn ${lang === 'fr' ? 'active' : ''}`} onClick={() => setLang('fr')}>FR</button>
          <span className="lang-sep">·</span>
          <button className={`lang-btn ${lang === 'en' ? 'active' : ''}`} onClick={() => setLang('en')}>EN</button>
        </div>

        <div className="content">
          <Link href="/" className="nav-back">{t.nav}</Link>

          <h1 className="heading">{t.heading}</h1>
          <p className="sub">{t.sub}</p>

          <div className="body">
            {t.body.map((para, i) => (
              <p key={i} className={i === 2 ? 'para para-main' : 'para'}>{para}</p>
            ))}
          </div>

          <Link href="/" className="cta">{t.cta}</Link>
        </div>

        <div className="footer">
          <a href="https://studioexistence.com" target="_blank" rel="noopener noreferrer">{t.footer}</a>
        </div>
      </div>

      <style jsx>{`
        .page {
          min-height: 100%;
          background: var(--room);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 4rem 2rem;
          position: relative;
        }

        .lang-toggle {
          position: fixed;
          top: 1.5rem;
          right: 1.5rem;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          z-index: 10;
        }
        .lang-btn {
          background: none;
          border: none;
          cursor: pointer;
          font-family: 'Cormorant Garamond', serif;
          font-style: italic;
          font-size: 0.85rem;
          letter-spacing: 0.12em;
          color: var(--text-dim);
          padding: 0;
          transition: color 0.3s;
          opacity: 0.5;
        }
        .lang-btn.active { opacity: 1; color: var(--text); }
        .lang-btn:hover { opacity: 1; color: var(--gold); }
        .lang-sep { font-family: 'Cormorant Garamond', serif; color: var(--text-dim); font-size: 0.85rem; opacity: 0.3; }

        .content {
          max-width: 600px;
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          animation: fadeIn 1s ease;
        }

        .nav-back {
          font-family: 'Inter', sans-serif;
          font-size: 0.75rem;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: var(--text-dim);
          text-decoration: none;
          opacity: 0.5;
          transition: opacity 0.3s;
          margin-bottom: 1rem;
        }
        .nav-back:hover { opacity: 1; }

        .heading {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(2.5rem, 8vw, 4rem);
          font-weight: 300;
          letter-spacing: 0.2em;
          color: var(--text);
          margin: 0;
        }

        .sub {
          font-family: 'Cormorant Garamond', serif;
          font-style: italic;
          font-size: 0.9rem;
          letter-spacing: 0.1em;
          color: var(--text-dim);
          margin: -0.5rem 0 1rem;
        }

        .body { display: flex; flex-direction: column; gap: 1.25rem; }

        .para {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(1rem, 2.5vw, 1.15rem);
          line-height: 1.85;
          color: var(--text-dim);
          letter-spacing: 0.03em;
          margin: 0;
        }

        .para-main {
          color: var(--text);
          font-size: clamp(1.05rem, 2.5vw, 1.2rem);
          border-left: 1px solid var(--gold-dim);
          padding-left: 1.5rem;
          margin: 0.5rem 0;
        }

        .cta {
          display: inline-block;
          margin-top: 1.5rem;
          background: none;
          border: 1px solid var(--waiting);
          color: var(--text);
          font-family: 'Inter', sans-serif;
          font-size: 0.85rem;
          font-weight: 300;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          padding: 0.9rem 2.5rem;
          text-decoration: none;
          transition: border-color 0.4s, color 0.4s;
          align-self: flex-start;
        }
        .cta:hover { border-color: var(--gold); color: var(--gold); }

        .footer {
          position: fixed;
          bottom: 1.5rem;
          left: 50%;
          transform: translateX(-50%);
        }
        .footer a {
          font-family: 'Cormorant Garamond', serif;
          font-style: italic;
          font-size: 0.75rem;
          letter-spacing: 0.1em;
          color: var(--text-dim);
          text-decoration: none;
          opacity: 0.4;
          transition: opacity 0.3s;
        }
        .footer a:hover { opacity: 0.8; }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}

export default dynamic(() => Promise.resolve(About), { ssr: false });
