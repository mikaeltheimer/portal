import { useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import Link from 'next/link';
import { io } from 'socket.io-client';
import { useWebRTC } from '../hooks/useWebRTC';

function isRestrictedWebView() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|Instagram|Messenger|LinkedInApp|Twitter|Snapchat|TikTok|MicroMessenger/.test(ua);
}

function getBrowserLang() {
  if (typeof navigator === 'undefined') return 'fr';
  const lang = navigator.language || navigator.languages?.[0] || 'fr';
  return lang.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

function formatDuration(seconds, lang) {
  if (seconds < 60) {
    return lang === 'fr'
      ? `${seconds} seconde${seconds > 1 ? 's' : ''}`
      : `${seconds} second${seconds > 1 ? 's' : ''}`;
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (lang === 'fr') return s > 0 ? `${m} min ${s} sec` : `${m} minute${m > 1 ? 's' : ''}`;
  return s > 0 ? `${m} min ${s} sec` : `${m} minute${m > 1 ? 's' : ''}`;
}

const COPY = {
  fr: {
    title: 'Interstice',
    desc: 'Une expérience de connexion éphémère entre deux inconnus.',
    subtitle: 'Une rencontre éphémère.\nDeux présences. Un geste commun.',
    instructionMic: 'Mettez vos écouteurs, puis autorisez le microphone.',
    btnMic: 'Autoriser le microphone',
    micReady: 'Microphone prêt.',
    btnEnter: 'Entrer',
    counter: (n) => n === 1 ? `${n} interstice s'est ouvert depuis le début.` : `${n} interstices se sont ouverts depuis le début.`,
    micErrorHttps: 'HTTPS requis pour accéder au microphone.',
    micErrorDenied: "L'accès au microphone a été refusé.",
    alone: 'Cette salle attend une seconde présence.\nIl n\'y a rien à faire, sinon patienter.',
    partnerHere: (touch) => touch
      ? "Quelqu'un est là.\n\nMaintenez votre doigt sur le cercle."
      : "Quelqu'un est là.\n\nMaintenez votre clic sur le cercle.",
    waitingOther: (touch) => touch ? "L'autre attend.\n\nMaintenez votre doigt sur le cercle." : "L'autre attend.\n\nMaintenez votre clic sur le cercle.",
    otherReaching: (touch) => touch ? "L'autre attend.\n\nMaintenez votre doigt sur le cercle." : "L'autre attend.\n\nMaintenez votre clic sur le cercle.",
    connected: (touch) => touch ? 'Levez le doigt, et ce moment disparaîtra à jamais.' : 'Relâchez, et ce moment disparaîtra à jamais.',
    ended: "L'interstice s'est refermé.",
    endedSub: 'Ce moment a existé.',
    endedDuration: (d, total) => `Il a duré ${d}. ${total !== null ? `${total} interstices se sont ouverts depuis le début.` : ''}`,
    btnNewRoom: 'Entrer dans une nouvelle salle',
    footer: 'Une expérience de Studio Existence',
    aboutLink: 'À propos',
    roomFull: 'Toutes les salles sont occupées.\nRevenez dans quelques instants.',
    webviewTitle: 'Interstice doit être ouvert\ndans votre navigateur.',
    webviewSub: 'Cette expérience requiert l\'accès au microphone,\nqui n\'est pas disponible dans le navigateur\nintégré à cette application.',
    webviewCopy: 'Copiez le lien ci-dessous et collez-le\ndans Safari ou Chrome.',
    btnCopy: 'Copier le lien',
    btnCopied: 'Lien copié',
  },
  en: {
    title: 'Interstice',
    desc: 'An ephemeral connection experience between two strangers.',
    subtitle: 'A fleeting encounter.\nTwo strangers. One shared moment.',
    instructionMic: 'Wear headphones, then grant microphone access.',
    btnMic: 'Allow microphone',
    micReady: 'Microphone ready.',
    btnEnter: 'Enter',
    counter: (n) => n === 1 ? `${n} interstice has opened since the beginning.` : `${n} interstices have opened since the beginning.`,
    micErrorHttps: 'HTTPS is required to access the microphone.',
    micErrorDenied: 'Microphone access was denied.',
    alone: 'This room is waiting for another soul.\nNothing to do but wait.',
    partnerHere: (touch) => touch
      ? "Someone is here.\n\nPress and hold the circle."
      : "Someone is here.\n\nClick and hold the circle.",
    waitingOther: (touch) => touch ? "The other is waiting.\n\nPress and hold the circle." : "The other is waiting.\n\nClick and hold the circle.",
    otherReaching: (touch) => touch ? "The other is waiting.\n\nPress and hold the circle." : "The other is waiting.\n\nClick and hold the circle.",
    connected: () => 'Release, and this moment will be gone forever.',
    ended: 'The interstice has closed.',
    endedSub: 'This moment was real.',
    endedDuration: (d, total) => `It lasted ${d}. ${total !== null ? `${total} interstices have opened since the beginning.` : ''}`,
    btnNewRoom: 'Enter a new room',
    footer: 'An experience by Studio Existence',
    aboutLink: 'About',
    roomFull: 'All rooms are currently occupied.\nCome back in a moment.',
    webviewTitle: 'Interstice must be opened\nin your browser.',
    webviewSub: 'This experience requires microphone access,\nwhich is not available in the built-in browser\nof this application.',
    webviewCopy: 'Copy the link below and paste it\ninto Safari or Chrome.',
    btnCopy: 'Copy link',
    btnCopied: 'Link copied',
  },
};

const STATE = {
  INTRO: 'intro',
  WAITING_ALONE: 'waiting_alone',
  PARTNER_HERE: 'partner_here',
  PORTAL_OPEN: 'portal_open',
  ENDED: 'ended',
  FULL: 'full',
};

function Home() {
  const [state, setState] = useState(STATE.INTRO);
  const [partnerHolding, setPartnerHolding] = useState(false);
  const [iHolding, setIHolding] = useState(false);
  const [micError, setMicError] = useState(false);
  const [micGranted, setMicGranted] = useState(false);
  const [lang, setLang] = useState('fr');
  const [copied, setCopied] = useState(false);
  const [totalConnections, setTotalConnections] = useState(null);
  const [sessionDuration, setSessionDuration] = useState(null);
  const [webView] = useState(() => typeof window !== 'undefined' && isRestrictedWebView());
  const [isTouch] = useState(() => typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);

  const socketRef = useRef(null);
  const holdingRef = useRef(false);
  const isInitiatorRef = useRef(false);
  const localStreamRef = useRef(null);

  const { prefetchIceServers, startCall, stopCall, handleOffer, handleAnswer, handleIce } = useWebRTC(socketRef, localStreamRef);

  useEffect(() => { setLang(getBrowserLang()); }, []);

  // Fetch initial stats
  useEffect(() => {
    fetch('/api/stats')
      .then(r => r.json())
      .then(data => setTotalConnections(data.totalConnections))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on('connect', () => console.log('[socket] connected:', socket.id));
    socket.on('connect_error', err => console.error('[socket] error:', err.message));

    socket.on('waiting-alone', () => {
      setState(STATE.WAITING_ALONE);
      isInitiatorRef.current = true;
    });

    socket.on('partner-arrived', () => {
      setState(STATE.PARTNER_HERE);
      prefetchIceServers();
    });
    socket.on('partner-holding', holding => setPartnerHolding(holding));
    socket.on('room-full', () => setState(STATE.FULL));

    socket.on('stats-update', ({ totalConnections: tc }) => {
      setTotalConnections(tc);
    });

    socket.on('portal-open', async () => {
      setState(STATE.PORTAL_OPEN);
      try { await startCall(isInitiatorRef.current); }
      catch (e) { console.error('[webrtc] startCall error:', e); setMicError(true); }
    });

    socket.on('portal-closed', ({ duration }) => {
      stopCall();
      setSessionDuration(duration || 0);
      setState(STATE.ENDED);
    });

    socket.on('rtc-offer', data => handleOffer(data));
    socket.on('rtc-answer', data => handleAnswer(data));
    socket.on('rtc-ice', handleIce);

    return () => { socket.disconnect(); stopCall(); };
  }, []);

  const t = COPY[lang];

  const handleRequestMic = useCallback(() => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMicError(true); return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then(stream => { localStreamRef.current = stream; setMicGranted(true); })
      .catch(() => setMicError(true));
  }, []);

  const handleEnter = useCallback(() => {
    isInitiatorRef.current = false;
    setState(STATE.WAITING_ALONE);
    socketRef.current?.emit('enter');
  }, []);

  const handleNewRoom = useCallback(() => {
    holdingRef.current = false;
    setIHolding(false);
    setPartnerHolding(false);
    setSessionDuration(null);
    isInitiatorRef.current = false;
    setState(STATE.WAITING_ALONE);
    socketRef.current?.emit('enter');
  }, []);

  const handleHoldStart = useCallback((e) => {
    e.preventDefault();
    if (state !== STATE.PARTNER_HERE) return;
    if (holdingRef.current) return;
    holdingRef.current = true;
    setIHolding(true);
    socketRef.current?.emit('hold-start');
  }, [state]);

  const handleHoldEnd = useCallback((e) => {
    e.preventDefault();
    if (!holdingRef.current) return;
    holdingRef.current = false;
    setIHolding(false);
    setPartnerHolding(false);
    socketRef.current?.emit('hold-end');
  }, []);

  const handleCopyLink = useCallback(() => {
    const url = window.location.href;
    const doFallback = () => {
      const el = document.createElement('textarea');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      }).catch(doFallback);
    } else { doFallback(); }
  }, []);

  const getButtonState = () => {
    if (state === STATE.PORTAL_OPEN) return 'connected';
    if (iHolding) return 'holding';
    if (partnerHolding) return 'partner-holding';
    if (state === STATE.PARTNER_HERE) return 'ready';
    return 'dormant';
  };

  const getMessage = () => {
    switch (state) {
      case STATE.WAITING_ALONE: return t.alone;
      case STATE.FULL: return t.roomFull;
      case STATE.PARTNER_HERE:
        if (iHolding && !partnerHolding) return t.waitingOther(isTouch);
        if (partnerHolding && !iHolding) return t.otherReaching(isTouch);
        return t.partnerHere(isTouch);
      case STATE.PORTAL_OPEN: return t.connected(isTouch);
      default: return null;
    }
  };

  const isConnected = state === STATE.PORTAL_OPEN;
  const isDirective = state === STATE.PARTNER_HERE || state === STATE.PORTAL_OPEN;
  const btnState = getButtonState();

  // Ambient light intensity class
  const ambientClass = () => {
    if (isConnected) return 'ambient-portal';
    if (state === STATE.PARTNER_HERE) return 'ambient-gold';
    return 'ambient-base'; // intro + waiting alone — strongest
  };
  const showExperience = !webView && state !== STATE.INTRO && state !== STATE.ENDED && state !== STATE.FULL;
  const BASE_URL = 'https://interstice.studioexistence.com';

  return (
    <>
      <Head>
        <title>{t.title}</title>
        <meta name="description" content={t.desc} />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="theme-color" content="#0a0a0f" />
        {/* Open Graph */}
        <meta property="og:title" content="Interstice" />
        <meta property="og:description" content={t.desc} />
        <meta property="og:image" content={`${BASE_URL}/og-image.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:url" content={BASE_URL} />
        <meta property="og:type" content="website" />
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Interstice" />
        <meta name="twitter:description" content={t.desc} />
        <meta name="twitter:image" content={`${BASE_URL}/og-image.png`} />
      </Head>

      <div className={`room ${isConnected ? 'room-lit' : ''}`}>

        {/* AMBIENT LIGHT */}
        <div className={`ambient ${ambientClass()}`} />

        {/* LANG TOGGLE */}
        {state !== STATE.PORTAL_OPEN && (
          <div className="lang-toggle">
            <button className={`lang-btn ${lang === 'fr' ? 'active' : ''}`} onClick={() => setLang('fr')}>FR</button>
            <span className="lang-sep">·</span>
            <button className={`lang-btn ${lang === 'en' ? 'active' : ''}`} onClick={() => setLang('en')}>EN</button>
          </div>
        )}

        {/* WEBVIEW */}
        {webView && (
          <div className="webview">
            <h1 className="title">{t.title}</h1>
            <p className="webview-title">{t.webviewTitle}</p>
            <p className="webview-sub">{t.webviewSub}</p>
            <p className="webview-copy">{t.webviewCopy}</p>
            <div className="webview-url">{typeof window !== 'undefined' ? window.location.href : ''}</div>
            <button className={`enter-btn ${copied ? 'copied' : ''}`} onClick={handleCopyLink}>
              {copied ? t.btnCopied : t.btnCopy}
            </button>
          </div>
        )}

        {/* INTRO */}
        {!webView && state === STATE.INTRO && (
          <div className="intro">
            <h1 className="title">{t.title}</h1>
            <p className="subtitle">{t.subtitle.split('\n').map((line, i) => (
              <span key={i}>{line}{i === 0 && <br />}</span>
            ))}</p>
            {totalConnections !== null && totalConnections > 0 && (
              <p className="counter">{t.counter(totalConnections)}</p>
            )}

            {micError && (
              <p className="mic-error">
                {typeof navigator !== 'undefined' && !navigator.mediaDevices ? t.micErrorHttps : t.micErrorDenied}
              </p>
            )}
            {!micGranted ? (
              <>
                <p className="instruction">{t.instructionMic}</p>
                <button className="enter-btn" onClick={handleRequestMic}>{t.btnMic}</button>
              </>
            ) : (
              <>
                <p className="instruction granted">{t.micReady}</p>
                <button className="enter-btn" onClick={handleEnter}>{t.btnEnter}</button>
              </>
            )}
          </div>
        )}

        {/* EXPERIENCE */}
        {showExperience && (
          <div className="experience">
            <div className="message-zone">
              {getMessage() && (() => {
                const msg = getMessage();
                const parts = msg.split('\n\n');
                const hasTwoParts = parts.length === 2;
                return hasTwoParts ? (
                  <div className={`message-block ${isConnected ? 'message-lit' : ''}`}>
                    <p className="msg-poetic">{parts[0]}</p>
                    <p className="msg-directive">{parts[1]}</p>
                  </div>
                ) : (
                  <p className={`message ${isDirective ? 'message-directive' : ''} ${isConnected ? 'message-lit' : ''}`}>
                    {msg.split('\n').map((line, i, arr) => (
                      <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
                    ))}
                  </p>
                );
              })()}
            </div>

            <div className="button-zone">
              <button
                className={`portal-btn ${btnState}`}
                onMouseDown={handleHoldStart}
                onMouseUp={handleHoldEnd}
                onMouseLeave={handleHoldEnd}
                onTouchStart={handleHoldStart}
                onTouchEnd={handleHoldEnd}
                onTouchCancel={handleHoldEnd}
                disabled={state === STATE.WAITING_ALONE}
                aria-label="Interstice"
              >
                <div className="btn-inner" />
              </button>
            </div>
          </div>
        )}

        {/* FULL */}
        {!webView && state === STATE.FULL && (
          <div className="ended">
            <p className="ended-text">{t.roomFull.split('\n')[0]}</p>
            <p className="ended-sub">{t.roomFull.split('\n')[1]}</p>
          </div>
        )}

        {/* ENDED */}
        {!webView && state === STATE.ENDED && (
          <div className="ended">
            <p className="ended-text">{t.ended}</p>
            <p className="ended-sub">{t.endedSub}</p>
            {sessionDuration !== null && (
              <p className="ended-duration">
                {t.endedDuration(
                  formatDuration(sessionDuration, lang),
                  totalConnections
                )}
              </p>
            )}
            <button className="enter-btn" onClick={handleNewRoom}>{t.btnNewRoom}</button>
          </div>
        )}

        {/* FOOTER */}
        {!webView && (
          <div className="footer">
            <Link href={`/about?lang=${lang}`} className="footer-link">{t.aboutLink}</Link>
            <span className="footer-sep">·</span>
            <a href="https://studioexistence.com" target="_blank" rel="noopener noreferrer" className="footer-link">{t.footer}</a>
          </div>
        )}
      </div>

      <style jsx>{`
        .room {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--room);
          transition: background 2s ease;
          position: relative;
        }
        .room-lit { background: #0d1a24; }

        /* ── AMBIENT LIGHT ── */
        .ambient {
          position: absolute;
          inset: 0;
          pointer-events: none;
          border-radius: inherit;
          transition: opacity 2s ease;
        }

        /* Intro + waiting alone — strong blue glow, pulses slowly */
        .ambient.ambient-base {
          background: radial-gradient(ellipse 70% 60% at 50% 50%,
            rgba(126, 184, 201, 0.18) 0%,
            rgba(126, 184, 201, 0.07) 40%,
            transparent 70%
          );
          animation: ambientBase 4s ease-in-out infinite;
        }
        @keyframes ambientBase {
          0%, 100% { opacity: 0.8; transform: scale(1); }
          50%       { opacity: 1;   transform: scale(1.08); }
        }

        /* Partner present — warm gold glow */
        .ambient.ambient-gold {
          background: radial-gradient(ellipse 65% 55% at 50% 50%,
            rgba(201, 185, 154, 0.14) 0%,
            rgba(201, 185, 154, 0.05) 45%,
            transparent 70%
          );
          animation: ambientGold 2.5s ease-in-out infinite;
        }
        @keyframes ambientGold {
          0%, 100% { opacity: 0.75; transform: scale(1); }
          50%       { opacity: 1;    transform: scale(1.06); }
        }

        /* Connected — cathedral blue, intense */
        .ambient.ambient-portal {
          background: radial-gradient(ellipse 75% 65% at 50% 50%,
            rgba(126, 184, 201, 0.22) 0%,
            rgba(126, 184, 201, 0.08) 45%,
            transparent 70%
          );
          animation: ambientPortal 3s ease-in-out infinite;
        }
        @keyframes ambientPortal {
          0%, 100% { opacity: 0.85; transform: scale(1); }
          50%       { opacity: 1;    transform: scale(1.1); }
        }

        .lang-toggle {
          position: absolute;
          top: 1.5rem;
          right: 1.5rem;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          z-index: 10;
        }
        .lang-btn {
          background: none; border: none; cursor: pointer;
          font-family: 'Cormorant Garamond', serif; font-style: italic;
          font-size: 0.85rem; letter-spacing: 0.12em;
          color: var(--text-dim); padding: 0;
          transition: color 0.3s; opacity: 0.5;
        }
        .lang-btn.active { opacity: 1; color: var(--text); }
        .lang-btn:hover { opacity: 1; color: var(--gold); }
        .lang-sep { font-family: 'Cormorant Garamond', serif; color: var(--text-dim); font-size: 0.85rem; opacity: 0.3; }

        .footer {
          position: absolute;
          bottom: 1.5rem;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 0.6rem;
          white-space: nowrap;
        }
        /* .footer-link styles are in globals.css */
        .footer-sep { font-family: 'Cormorant Garamond', serif; color: var(--text-dim); font-size: 0.75rem; opacity: 0.2; }

        /* WEBVIEW */
        .webview {
          display: flex; flex-direction: column; align-items: center;
          gap: 1.5rem; text-align: center;
          padding: 2.5rem 2rem; max-width: 400px;
          animation: fadeIn 1.2s ease;
        }
        .webview-title {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(1.1rem, 3.5vw, 1.4rem); font-weight: 300;
          color: var(--text); line-height: 1.6; letter-spacing: 0.05em; white-space: pre-line;
        }
        .webview-sub {
          font-family: 'Cormorant Garamond', serif; font-style: italic;
          font-size: clamp(0.85rem, 2.5vw, 1rem); color: var(--text-dim);
          line-height: 1.75; letter-spacing: 0.04em; white-space: pre-line;
        }
        .webview-copy {
          font-size: 0.75rem; letter-spacing: 0.1em; color: var(--gold-dim);
          text-transform: uppercase; white-space: pre-line; line-height: 1.8;
        }
        .webview-url {
          font-family: 'Inter', sans-serif; font-size: 0.75rem; color: var(--text-dim);
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
          padding: 0.6rem 1rem; border-radius: 2px; letter-spacing: 0.02em;
          word-break: break-all; max-width: 300px;
        }
        .enter-btn.copied { border-color: var(--cathedral-dim); color: var(--cathedral); }

        /* INTRO */
        .intro {
          display: flex; flex-direction: column; align-items: center;
          gap: 2rem; text-align: center; padding: 2rem;
          animation: fadeIn 1.2s ease;
        }
        .title {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(3rem, 10vw, 6rem); font-weight: 300;
          letter-spacing: 0.2em; color: var(--text);
        }
        .subtitle {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(1rem, 3vw, 1.3rem); font-weight: 300; font-style: italic;
          color: var(--text-dim); line-height: 1.8; letter-spacing: 0.05em;
        }
        .instruction { font-size: 0.8rem; letter-spacing: 0.12em; color: var(--gold-dim); text-transform: uppercase; }
        .instruction.granted { color: var(--cathedral-dim); }
        .mic-error { font-size: 0.8rem; color: #8a4a4a; letter-spacing: 0.08em; }
        .counter {
          font-family: 'Cormorant Garamond', serif;
          font-style: italic;
          font-size: 0.85rem;
          letter-spacing: 0.08em;
          color: var(--text-dim);
          text-align: center;
        }

        .enter-btn {
          background: none; border: 1px solid var(--waiting); color: var(--text);
          font-family: 'Inter', sans-serif; font-size: 0.85rem; font-weight: 300;
          letter-spacing: 0.25em; text-transform: uppercase;
          padding: 0.9rem 2.5rem; cursor: pointer; transition: border-color 0.4s, color 0.4s;
        }
        .enter-btn:hover { border-color: var(--gold); color: var(--gold); }

        /* EXPERIENCE */
        .experience {
          width: 100%; height: 100%;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          position: relative;
        }
        .message-zone {
          min-height: 6rem; display: flex; align-items: center; justify-content: center;
          margin-bottom: 3rem; padding: 0 2rem; max-width: 500px; width: 100%;
        }
        .message {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(1rem, 2.5vw, 1.15rem); font-style: italic;
          color: var(--text-dim); letter-spacing: 0.04em; line-height: 1.75;
          animation: fadeIn 0.8s ease; text-align: center;
          transition: color 1.5s ease, font-size 0.4s ease;
        }
        .message.message-directive {
          font-size: clamp(1.15rem, 3.5vw, 1.45rem); color: var(--text);
          font-style: normal; font-weight: 300; letter-spacing: 0.06em; line-height: 1.8;
        }
        .message.message-lit { color: #c8dde8; font-style: italic; }

        /* Two-part message: poetic line + directive line */
        .message-block {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.2rem;
          animation: fadeIn 0.8s ease;
          text-align: center;
        }
        .message-block.message-lit .msg-poetic { color: #c8dde8; }

        .msg-poetic {
          font-family: 'Cormorant Garamond', serif;
          font-style: italic;
          font-size: clamp(1rem, 2.5vw, 1.1rem);
          color: var(--text-dim);
          letter-spacing: 0.05em;
          line-height: 1.7;
        }

        .msg-directive {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(1.25rem, 4vw, 1.6rem);
          font-weight: 300;
          font-style: normal;
          color: var(--text);
          letter-spacing: 0.06em;
          line-height: 1.5;
        }

        /* BUTTON */
        .button-zone { display: flex; align-items: center; justify-content: center; }
        .portal-btn {
          position: relative;
          width: clamp(160px, 38vw, 240px); height: clamp(160px, 38vw, 240px);
          border-radius: 50%; background: none; border: none; cursor: default;
          padding: 0; -webkit-tap-highlight-color: transparent; outline: none;
        }
        .portal-btn:not(:disabled) { cursor: pointer; }
        .btn-inner {
          position: absolute; inset: 0; border-radius: 50%;
          transition: background 1.2s ease, box-shadow 1.2s ease;
        }
        .portal-btn.dormant .btn-inner {
          background: #12122a;
          box-shadow: 0 0 0 1px #1e1e3a, inset 0 0 30px 0 rgba(100,90,160,0.06);
        }
        .portal-btn.ready .btn-inner {
          background: #1a1a30;
          box-shadow: 0 0 0 1px var(--gold-dim), 0 0 50px 0 rgba(201,185,154,0.1), inset 0 0 40px 0 rgba(201,185,154,0.05);
          animation: breathe-gold 2.5s ease-in-out infinite;
        }
        .portal-btn.partner-holding .btn-inner {
          background: rgba(201,185,154,0.08);
          box-shadow: 0 0 0 1px var(--gold), 0 0 80px 0 rgba(201,185,154,0.18), inset 0 0 50px 0 rgba(201,185,154,0.08);
          animation: none;
        }
        .portal-btn.holding .btn-inner {
          background: rgba(201,185,154,0.12);
          box-shadow: 0 0 0 1px var(--gold), 0 0 100px 0 rgba(201,185,154,0.22), inset 0 0 60px 0 rgba(201,185,154,0.1);
          animation: none;
        }
        .portal-btn.connected .btn-inner {
          background: radial-gradient(circle at center,
            rgba(220,240,255,0.95) 0%, rgba(160,210,240,0.7) 35%,
            rgba(80,160,200,0.3) 65%, transparent 100%);
          box-shadow:
            0 0 0 1px rgba(180,220,240,0.6),
            0 0 60px 20px rgba(126,184,201,0.35),
            0 0 120px 40px rgba(126,184,201,0.2),
            0 0 200px 80px rgba(126,184,201,0.08),
            inset 0 0 60px 0 rgba(220,240,255,0.15);
          animation: portal-pulse 3s ease-in-out infinite;
        }

        /* ENDED */
        .ended {
          display: flex; flex-direction: column; align-items: center;
          gap: 1.5rem; text-align: center; padding: 2rem;
          animation: fadeIn 1.5s ease; max-width: 480px;
        }
        .ended-text {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(1.5rem, 5vw, 2.5rem); font-weight: 300;
          color: var(--text); letter-spacing: 0.1em;
        }
        .ended-sub {
          font-family: 'Cormorant Garamond', serif; font-style: italic;
          font-size: clamp(0.9rem, 2vw, 1.1rem); color: var(--text-dim);
          letter-spacing: 0.06em; margin-top: -0.5rem;
        }
        .ended-duration {
          font-family: 'Cormorant Garamond', serif; font-style: italic;
          font-size: clamp(0.85rem, 2vw, 1rem); color: var(--text-dim);
          letter-spacing: 0.04em; line-height: 1.7; opacity: 0.7;
          border-top: 1px solid rgba(255,255,255,0.06);
          padding-top: 1rem; margin-top: 0.25rem;
        }

        /* ANIMATIONS */
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes breathe-gold {
          0%, 100% { box-shadow: 0 0 0 1px var(--gold-dim), 0 0 40px 0 rgba(201,185,154,0.08), inset 0 0 30px 0 rgba(201,185,154,0.04); transform: scale(1); }
          50%       { box-shadow: 0 0 0 1px var(--gold), 0 0 70px 0 rgba(201,185,154,0.14), inset 0 0 50px 0 rgba(201,185,154,0.07); transform: scale(1.015); }
        }
        @keyframes portal-pulse {
          0%, 100% {
            box-shadow: 0 0 0 1px rgba(180,220,240,0.6), 0 0 60px 20px rgba(126,184,201,0.35),
              0 0 120px 40px rgba(126,184,201,0.2), 0 0 200px 80px rgba(126,184,201,0.08),
              inset 0 0 60px 0 rgba(220,240,255,0.15);
          }
          50% {
            box-shadow: 0 0 0 1px rgba(200,235,255,0.8), 0 0 80px 30px rgba(126,184,201,0.45),
              0 0 160px 60px rgba(126,184,201,0.25), 0 0 260px 100px rgba(126,184,201,0.1),
              inset 0 0 80px 0 rgba(220,240,255,0.2);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .portal-btn .btn-inner { animation: none !important; }
        }
      `}</style>
    </>
  );
}

export default dynamic(() => Promise.resolve(Home), { ssr: false });
