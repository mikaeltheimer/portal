import { useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';
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

const COPY = {
  fr: {
    title: 'Interstice',
    subtitle: 'Une rencontre éphémère.\nDeux présences. Un geste commun.',
    instructionMic: 'Mettez vos écouteurs, puis autorisez le microphone.',
    btnMic: 'Autoriser le microphone',
    micReady: 'Microphone prêt.',
    btnEnter: 'Entrer',
    micErrorHttps: 'HTTPS requis pour accéder au microphone.',
    micErrorDenied: "L'accès au microphone a été refusé.",
    alone: 'Cette salle attend une seconde présence.\nIl n\'y a rien à faire, sinon patienter.',
    partnerHere: 'Quelqu\'un est là. Posez et maintenez\nvotre doigt sur le cercle — et espérez\nque l\'autre en fasse autant.',
    waitingOther: "En attente de l'autre…",
    otherReaching: "L'autre tend la main.",
    connected: 'Le portail est ouvert.\nLevez votre doigt, et ce moment\ndisparaîtra à jamais.',
    ended: "L'interstice s'est refermé.",
    endedSub: 'Ce moment a existé.',
    btnNewRoom: 'Entrer dans une nouvelle salle',
    footer: 'Une expérience de Studio Existence',
    webviewTitle: 'Interstice doit être ouvert\ndans votre navigateur.',
    webviewSub: 'Cette expérience requiert l\'accès au microphone,\nqui n\'est pas disponible dans le navigateur\nintégré à cette application.',
    webviewCopy: 'Copiez le lien ci-dessous et collez-le\ndans Safari ou Chrome.',
    btnCopy: 'Copier le lien',
    btnCopied: 'Lien copié',
  },
  en: {
    title: 'Interstice',
    subtitle: 'A fleeting encounter.\nTwo strangers. One shared moment.',
    instructionMic: 'Wear headphones, then grant microphone access.',
    btnMic: 'Allow microphone',
    micReady: 'Microphone ready.',
    btnEnter: 'Enter',
    micErrorHttps: 'HTTPS is required to access the microphone.',
    micErrorDenied: 'Microphone access was denied.',
    alone: 'This room is waiting for another soul.\nNothing to do but wait.',
    partnerHere: 'Someone has arrived. Press and hold\nthe circle — and trust that\nthe other will too.',
    waitingOther: 'Waiting for the other…',
    otherReaching: 'The other is reaching out.',
    connected: 'The interstice is open.\nRelease your finger, and this moment\nwill be gone forever.',
    ended: 'The interstice has closed.',
    endedSub: 'This moment was real.',
    btnNewRoom: 'Enter a new room',
    footer: 'An experience by Studio Existence',
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
};

function Home() {
  const [state, setState] = useState(STATE.INTRO);
  const [partnerHolding, setPartnerHolding] = useState(false);
  const [iHolding, setIHolding] = useState(false);
  const [micError, setMicError] = useState(false);
  const [micGranted, setMicGranted] = useState(false);
  const [lang, setLang] = useState('fr');
  const [copied, setCopied] = useState(false);
  const [webView] = useState(() => typeof window !== 'undefined' && isRestrictedWebView());

  const socketRef = useRef(null);
  const holdingRef = useRef(false);
  const isInitiatorRef = useRef(false);
  const localStreamRef = useRef(null);

  const { startCall, stopCall, handleOffer, handleAnswer, handleIce } = useWebRTC(socketRef, localStreamRef);

  useEffect(() => {
    setLang(getBrowserLang());
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

    socket.on('partner-arrived', () => setState(STATE.PARTNER_HERE));
    socket.on('partner-holding', holding => setPartnerHolding(holding));

    socket.on('portal-open', async () => {
      setState(STATE.PORTAL_OPEN);
      try { await startCall(isInitiatorRef.current); }
      catch (e) { console.error('[webrtc] startCall error:', e); setMicError(true); }
    });

    socket.on('portal-closed', () => { stopCall(); setState(STATE.ENDED); });
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
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }).catch(() => {
      // Fallback for older browsers
      const el = document.createElement('textarea');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
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
      case STATE.PARTNER_HERE:
        if (iHolding && !partnerHolding) return t.waitingOther;
        if (partnerHolding && !iHolding) return t.otherReaching;
        return t.partnerHere;
      case STATE.PORTAL_OPEN: return t.connected;
      default: return null;
    }
  };

  const isConnected = state === STATE.PORTAL_OPEN;
  const btnState = getButtonState();
  const isDirective = state === STATE.PARTNER_HERE || state === STATE.PORTAL_OPEN;

  return (
    <>
      <Head>
        <title>Interstice</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="theme-color" content="#0a0a0f" />
      </Head>

      <div className={`room ${isConnected ? 'room-lit' : ''}`}>

        {/* LANG TOGGLE — always visible except during active connection */}
        {state !== STATE.PORTAL_OPEN && (
          <div className="lang-toggle">
            <button className={`lang-btn ${lang === 'fr' ? 'active' : ''}`} onClick={() => setLang('fr')}>FR</button>
            <span className="lang-sep">·</span>
            <button className={`lang-btn ${lang === 'en' ? 'active' : ''}`} onClick={() => setLang('en')}>EN</button>
          </div>
        )}

        {/* WEBVIEW — Facebook / restricted browser */}
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
            {micError && (
              <p className="mic-error">
                {typeof navigator !== 'undefined' && !navigator.mediaDevices
                  ? t.micErrorHttps : t.micErrorDenied}
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
        {!webView && state !== STATE.INTRO && state !== STATE.ENDED && (
          <div className="experience">
            <div className="message-zone">
              {getMessage() && (
                <p className={`message ${isDirective ? 'message-directive' : ''} ${isConnected ? 'message-lit' : ''}`}>
                  {getMessage().split('\n').map((line, i, arr) => (
                    <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
                  ))}
                </p>
              )}
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

        {/* ENDED */}
        {!webView && state === STATE.ENDED && (
          <div className="ended">
            <p className="ended-text">{t.ended}</p>
            <p className="ended-sub">{t.endedSub}</p>
            <button className="enter-btn" onClick={handleNewRoom}>{t.btnNewRoom}</button>
          </div>
        )}

        {/* FOOTER */}
        <div className="footer">
          <a href="https://studioexistence.com" target="_blank" rel="noopener noreferrer">{t.footer}</a>
        </div>
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

        /* ── LANG TOGGLE ── */
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
        .lang-sep {
          font-family: 'Cormorant Garamond', serif;
          color: var(--text-dim);
          font-size: 0.85rem;
          opacity: 0.3;
        }

        /* ── FOOTER ── */
        .footer {
          position: absolute;
          bottom: 1.5rem;
          left: 50%;
          transform: translateX(-50%);
          white-space: nowrap;
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

        /* ── WEBVIEW ── */
        .webview {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.5rem;
          text-align: center;
          padding: 2.5rem 2rem;
          max-width: 400px;
          animation: fadeIn 1.2s ease;
        }
        .webview-title {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(1.1rem, 3.5vw, 1.4rem);
          font-weight: 300;
          color: var(--text);
          line-height: 1.6;
          letter-spacing: 0.05em;
          white-space: pre-line;
        }
        .webview-sub {
          font-family: 'Cormorant Garamond', serif;
          font-style: italic;
          font-size: clamp(0.85rem, 2.5vw, 1rem);
          color: var(--text-dim);
          line-height: 1.75;
          letter-spacing: 0.04em;
          white-space: pre-line;
        }
        .webview-copy {
          font-size: 0.75rem;
          letter-spacing: 0.1em;
          color: var(--gold-dim);
          text-transform: uppercase;
          white-space: pre-line;
          line-height: 1.8;
        }
        .webview-url {
          font-family: 'Inter', sans-serif;
          font-size: 0.75rem;
          color: var(--text-dim);
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          padding: 0.6rem 1rem;
          border-radius: 2px;
          letter-spacing: 0.02em;
          word-break: break-all;
          max-width: 300px;
        }
        .enter-btn.copied {
          border-color: var(--cathedral-dim);
          color: var(--cathedral);
        }

        /* ── INTRO ── */
        .intro {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2rem;
          text-align: center;
          padding: 2rem;
          animation: fadeIn 1.2s ease;
        }
        .title {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(3rem, 10vw, 6rem);
          font-weight: 300;
          letter-spacing: 0.2em;
          color: var(--text);
        }
        .subtitle {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(1rem, 3vw, 1.3rem);
          font-weight: 300;
          font-style: italic;
          color: var(--text-dim);
          line-height: 1.8;
          letter-spacing: 0.05em;
        }
        .instruction {
          font-size: 0.8rem;
          letter-spacing: 0.12em;
          color: var(--gold-dim);
          text-transform: uppercase;
        }
        .instruction.granted { color: var(--cathedral-dim); }
        .mic-error { font-size: 0.8rem; color: #8a4a4a; letter-spacing: 0.08em; }

        .enter-btn {
          background: none;
          border: 1px solid var(--waiting);
          color: var(--text);
          font-family: 'Inter', sans-serif;
          font-size: 0.85rem;
          font-weight: 300;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          padding: 0.9rem 2.5rem;
          cursor: pointer;
          transition: border-color 0.4s, color 0.4s;
        }
        .enter-btn:hover { border-color: var(--gold); color: var(--gold); }

        /* ── EXPERIENCE ── */
        .experience {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          position: relative;
        }

        .message-zone {
          min-height: 6rem;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 3rem;
          padding: 0 2rem;
          max-width: 500px;
          width: 100%;
        }

        /* Default message — subtle */
        .message {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(1rem, 2.5vw, 1.15rem);
          font-style: italic;
          color: var(--text-dim);
          letter-spacing: 0.04em;
          line-height: 1.75;
          animation: fadeIn 0.8s ease;
          text-align: center;
          transition: color 1.5s ease, font-size 0.4s ease;
        }

        /* Directive message — impossible to miss */
        .message.message-directive {
          font-size: clamp(1.15rem, 3.5vw, 1.45rem);
          color: var(--text);
          font-style: normal;
          font-weight: 300;
          letter-spacing: 0.06em;
          line-height: 1.8;
        }

        .message.message-lit {
          color: #c8dde8;
          font-style: italic;
        }

        /* ── BUTTON ── */
        .button-zone {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .portal-btn {
          position: relative;
          width: clamp(160px, 38vw, 240px);
          height: clamp(160px, 38vw, 240px);
          border-radius: 50%;
          background: none;
          border: none;
          cursor: default;
          padding: 0;
          -webkit-tap-highlight-color: transparent;
          outline: none;
        }
        .portal-btn:not(:disabled) { cursor: pointer; }

        .btn-inner {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          transition: background 1.2s ease, box-shadow 1.2s ease;
        }

        .portal-btn.dormant .btn-inner {
          background: #12122a;
          box-shadow: 0 0 0 1px #1e1e3a, inset 0 0 30px 0 rgba(100,90,160,0.06);
        }

        .portal-btn.ready .btn-inner {
          background: #1a1a30;
          box-shadow:
            0 0 0 1px var(--gold-dim),
            0 0 50px 0 rgba(201,185,154,0.1),
            inset 0 0 40px 0 rgba(201,185,154,0.05);
          animation: breathe-gold 2.5s ease-in-out infinite;
        }

        .portal-btn.partner-holding .btn-inner {
          background: rgba(201,185,154,0.08);
          box-shadow:
            0 0 0 1px var(--gold),
            0 0 80px 0 rgba(201,185,154,0.18),
            inset 0 0 50px 0 rgba(201,185,154,0.08);
          animation: none;
        }

        .portal-btn.holding .btn-inner {
          background: rgba(201,185,154,0.12);
          box-shadow:
            0 0 0 1px var(--gold),
            0 0 100px 0 rgba(201,185,154,0.22),
            inset 0 0 60px 0 rgba(201,185,154,0.1);
          animation: none;
        }

        .portal-btn.connected .btn-inner {
          background: radial-gradient(circle at center,
            rgba(220,240,255,0.95) 0%,
            rgba(160,210,240,0.7) 35%,
            rgba(80,160,200,0.3) 65%,
            transparent 100%
          );
          box-shadow:
            0 0 0 1px rgba(180,220,240,0.6),
            0 0 60px 20px rgba(126,184,201,0.35),
            0 0 120px 40px rgba(126,184,201,0.2),
            0 0 200px 80px rgba(126,184,201,0.08),
            inset 0 0 60px 0 rgba(220,240,255,0.15);
          animation: portal-pulse 3s ease-in-out infinite;
        }

        /* ── ENDED ── */
        .ended {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2rem;
          text-align: center;
          padding: 2rem;
          animation: fadeIn 1.5s ease;
        }
        .ended-text {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(1.5rem, 5vw, 2.5rem);
          font-weight: 300;
          color: var(--text);
          letter-spacing: 0.1em;
        }
        .ended-sub {
          font-family: 'Cormorant Garamond', serif;
          font-style: italic;
          font-size: clamp(0.9rem, 2vw, 1.1rem);
          color: var(--text-dim);
          letter-spacing: 0.06em;
          margin-top: -1rem;
        }

        /* ── ANIMATIONS ── */
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @keyframes breathe-gold {
          0%, 100% {
            box-shadow: 0 0 0 1px var(--gold-dim), 0 0 40px 0 rgba(201,185,154,0.08), inset 0 0 30px 0 rgba(201,185,154,0.04);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 0 1px var(--gold), 0 0 70px 0 rgba(201,185,154,0.14), inset 0 0 50px 0 rgba(201,185,154,0.07);
            transform: scale(1.015);
          }
        }

        @keyframes portal-pulse {
          0%, 100% {
            box-shadow:
              0 0 0 1px rgba(180,220,240,0.6),
              0 0 60px 20px rgba(126,184,201,0.35),
              0 0 120px 40px rgba(126,184,201,0.2),
              0 0 200px 80px rgba(126,184,201,0.08),
              inset 0 0 60px 0 rgba(220,240,255,0.15);
          }
          50% {
            box-shadow:
              0 0 0 1px rgba(200,235,255,0.8),
              0 0 80px 30px rgba(126,184,201,0.45),
              0 0 160px 60px rgba(126,184,201,0.25),
              0 0 260px 100px rgba(126,184,201,0.1),
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
