import { useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { io } from 'socket.io-client';
import { useWebRTC } from '../hooks/useWebRTC';

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
  const [selfMonitor, setSelfMonitorState] = useState(true);

  const socketRef = useRef(null);
  const holdingRef = useRef(false);
  const isInitiatorRef = useRef(false);
  const localStreamRef = useRef(null);

  const { startCall, stopCall, handleOffer, handleAnswer, handleIce, setSelfMonitor } = useWebRTC(socketRef, localStreamRef);

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

    socket.on('portal-closed', () => {
      stopCall();
      setState(STATE.ENDED);
    });

    socket.on('rtc-offer', data => handleOffer(data));
    socket.on('rtc-answer', data => handleAnswer(data));
    socket.on('rtc-ice', handleIce);

    return () => { socket.disconnect(); stopCall(); };
  }, []);

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
    setSelfMonitorState(true);
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

  const handleToggleSelfMonitor = useCallback(() => {
    const next = !selfMonitor;
    setSelfMonitorState(next);
    setSelfMonitor(next);
  }, [selfMonitor, setSelfMonitor]);

  const getButtonState = () => {
    if (state === STATE.PORTAL_OPEN) return 'connected';
    if (iHolding) return 'holding';
    if (partnerHolding) return 'partner-holding';
    if (state === STATE.PARTNER_HERE) return 'ready';
    return 'dormant'; // alone or waiting
  };

  const getMessage = () => {
    switch (state) {
      case STATE.WAITING_ALONE:
        return 'Cette salle attend une seconde présence. Il n\'y a rien à faire, sinon patienter.';
      case STATE.PARTNER_HERE:
        if (iHolding && !partnerHolding) return "En attente de l'autre…";
        if (partnerHolding && !iHolding) return "L'autre tend la main.";
        return "Quelqu'un est là. Posez et maintenez votre doigt sur le cercle — et espérez que l'autre en fasse autant.";
      case STATE.PORTAL_OPEN:
        return "Le portail est ouvert. Levez votre doigt, et ce moment disparaîtra à jamais.";
      default:
        return null;
    }
  };

  const btnState = getButtonState();
  const isConnected = state === STATE.PORTAL_OPEN;

  return (
    <>
      <Head>
        <title>Portail</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="theme-color" content="#0a0a0f" />
      </Head>

      <div className={`room ${isConnected ? 'room-lit' : ''}`}>

        {/* INTRO */}
        {state === STATE.INTRO && (
          <div className="intro">
            <h1 className="title">Portail</h1>
            <p className="subtitle">
              Une rencontre éphémère.<br />
              Deux présences. Un geste commun.
            </p>
            {micError && (
              <p className="mic-error">
                {typeof navigator !== 'undefined' && !navigator.mediaDevices
                  ? 'HTTPS requis pour accéder au microphone.'
                  : "L'accès au microphone a été refusé."}
              </p>
            )}
            {!micGranted ? (
              <>
                <p className="instruction">Mettez vos écouteurs, puis autorisez le microphone.</p>
                <button className="enter-btn" onClick={handleRequestMic}>
                  Autoriser le microphone
                </button>
              </>
            ) : (
              <>
                <p className="instruction granted">Microphone prêt.</p>
                <button className="enter-btn" onClick={handleEnter}>Entrer</button>
              </>
            )}
          </div>
        )}

        {/* EXPERIENCE */}
        {state !== STATE.INTRO && state !== STATE.ENDED && (
          <div className="experience">

            <div className="message-zone">
              {getMessage() && (
                <p className={`message ${state === STATE.PORTAL_OPEN ? 'message-lit' : ''}`}>
                  {getMessage()}
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
                aria-label="Portail"
              >
                <div className="btn-inner" />
              </button>
            </div>

            {state === STATE.PORTAL_OPEN && (
              <div className="controls">
                <button
                  className={`toggle-btn ${selfMonitor ? 'on' : 'off'}`}
                  onClick={handleToggleSelfMonitor}
                >
                  {selfMonitor ? 'Retour micro : activé' : 'Retour micro : désactivé'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ENDED */}
        {state === STATE.ENDED && (
          <div className="ended">
            <p className="ended-text">Le portail s'est fermé.</p>
            <p className="ended-sub">Ce moment a existé.</p>
            <button className="enter-btn" onClick={handleNewRoom}>
              Entrer dans une nouvelle salle
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        /* ── ROOM ── */
        .room {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--room);
          transition: background 2s ease;
        }
        .room-lit {
          background: #0d1a24;
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

        /* ── MESSAGE ── */
        .message-zone {
          min-height: 5rem;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 3rem;
          padding: 0 2rem;
          max-width: 480px;
          width: 100%;
        }
        .message {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(1rem, 2.5vw, 1.15rem);
          font-style: italic;
          color: var(--text-dim);
          letter-spacing: 0.04em;
          line-height: 1.75;
          animation: fadeIn 0.8s ease;
          text-align: center;
          transition: color 1.5s ease;
        }
        .message-lit {
          color: #c8dde8;
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

        /* DORMANT — alone, disabled but present */
        .portal-btn.dormant .btn-inner {
          background: #12122a;
          box-shadow:
            0 0 0 1px #1e1e3a,
            inset 0 0 30px 0 rgba(100, 90, 160, 0.06);
        }

        /* READY — partner present, inviting */
        .portal-btn.ready .btn-inner {
          background: #1a1a30;
          box-shadow:
            0 0 0 1px var(--gold-dim),
            0 0 50px 0 rgba(201, 185, 154, 0.1),
            inset 0 0 40px 0 rgba(201, 185, 154, 0.05);
          animation: breathe-gold 2.5s ease-in-out infinite;
        }

        /* PARTNER HOLDING */
        .portal-btn.partner-holding .btn-inner {
          background: rgba(201, 185, 154, 0.08);
          box-shadow:
            0 0 0 1px var(--gold),
            0 0 80px 0 rgba(201, 185, 154, 0.18),
            inset 0 0 50px 0 rgba(201, 185, 154, 0.08);
          animation: none;
        }

        /* HOLDING */
        .portal-btn.holding .btn-inner {
          background: rgba(201, 185, 154, 0.12);
          box-shadow:
            0 0 0 1px var(--gold),
            0 0 100px 0 rgba(201, 185, 154, 0.22),
            inset 0 0 60px 0 rgba(201, 185, 154, 0.1);
          animation: none;
        }

        /* CONNECTED — luminous portal */
        .portal-btn.connected .btn-inner {
          background: radial-gradient(circle at center,
            rgba(220, 240, 255, 0.95) 0%,
            rgba(160, 210, 240, 0.7) 35%,
            rgba(80, 160, 200, 0.3) 65%,
            transparent 100%
          );
          box-shadow:
            0 0 0 1px rgba(180, 220, 240, 0.6),
            0 0 60px 20px rgba(126, 184, 201, 0.35),
            0 0 120px 40px rgba(126, 184, 201, 0.2),
            0 0 200px 80px rgba(126, 184, 201, 0.08),
            inset 0 0 60px 0 rgba(220, 240, 255, 0.15);
          animation: portal-pulse 3s ease-in-out infinite;
        }

        /* ── CONTROLS ── */
        .controls {
          position: absolute;
          bottom: 2.5rem;
          left: 50%;
          transform: translateX(-50%);
          animation: fadeIn 1s ease;
        }
        .toggle-btn {
          background: none;
          border: none;
          cursor: pointer;
          font-family: 'Inter', sans-serif;
          font-size: 0.7rem;
          font-weight: 300;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          padding: 0.4rem 0;
          transition: color 0.3s;
          white-space: nowrap;
        }
        .toggle-btn.on  { color: rgba(200, 221, 232, 0.4); }
        .toggle-btn.off { color: var(--waiting); }
        .toggle-btn:hover { color: var(--gold); }

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
