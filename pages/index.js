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

  const socketRef = useRef(null);
  const holdingRef = useRef(false);
  const isInitiatorRef = useRef(false);
  const localStreamRef = useRef(null);

  const { startCall, stopCall, handleOffer, handleAnswer, handleIce } = useWebRTC(socketRef, localStreamRef);

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on('connect', () => console.log('[socket] connected:', socket.id));
    socket.on('connect_error', (err) => console.error('[socket] error:', err.message));

    socket.on('waiting-alone', () => {
      console.log('[socket] waiting-alone');
      setState(STATE.WAITING_ALONE);
      isInitiatorRef.current = true;
    });

    socket.on('partner-arrived', () => {
      console.log('[socket] partner-arrived');
      setState(STATE.PARTNER_HERE);
    });

    socket.on('partner-holding', (holding) => {
      console.log('[socket] partner-holding:', holding);
      setPartnerHolding(holding);
    });

    socket.on('portal-open', async () => {
      console.log('[socket] portal-open, isInitiator:', isInitiatorRef.current);
      setState(STATE.PORTAL_OPEN);
      try {
        await startCall(isInitiatorRef.current);
      } catch (e) {
        console.error('[webrtc] startCall error:', e);
        setMicError(true);
      }
    });

    socket.on('portal-closed', () => {
      console.log('[socket] portal-closed');
      stopCall();
      setState(STATE.ENDED);
    });

    socket.on('rtc-offer', (data) => { console.log('[rtc] offer received'); handleOffer(data); });
    socket.on('rtc-answer', (data) => { console.log('[rtc] answer received'); handleAnswer(data); });
    socket.on('rtc-ice', handleIce);

    return () => { socket.disconnect(); stopCall(); };
  }, []);

  // Safari iOS requires getUserMedia to fire synchronously from a click handler.
  // Using .then() instead of async/await avoids any microtask gap that Safari
  // treats as an expired user gesture.
  const handleRequestMic = useCallback(() => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error('[mic] mediaDevices unavailable — page must be served over HTTPS');
      setMicError(true);
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then((stream) => {
        localStreamRef.current = stream;
        console.log('[mic] granted');
        setMicGranted(true);
      })
      .catch((err) => {
        console.error('[mic] denied:', err);
        setMicError(true);
      });
  }, []);

  const handleEnter = useCallback(() => {
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

  const getButtonState = () => {
    if (state === STATE.PORTAL_OPEN) return 'connected';
    if (iHolding) return 'holding';
    if (partnerHolding) return 'partner-holding';
    if (state === STATE.PARTNER_HERE) return 'ready';
    if (state === STATE.WAITING_ALONE) return 'waiting';
    return 'inactive';
  };

  const getMessage = () => {
    if (micError) return 'Le microphone est inaccessible.';
    switch (state) {
      case STATE.WAITING_ALONE: return 'Une salle vous attend.';
      case STATE.PARTNER_HERE:
        if (iHolding && !partnerHolding) return "En attente de l'autre…";
        if (partnerHolding && !iHolding) return "L'autre tend la main.";
        return 'Posez votre doigt sur le cercle.';
      default: return null;
    }
  };

  const btnState = getButtonState();

  return (
    <>
      <Head>
        <title>Portail</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="theme-color" content="#0a0a0f" />
      </Head>

      <div className="room">

        {state === STATE.INTRO && (
          <div className="intro">
            <h1 className="title">Portail</h1>
            <p className="subtitle">
              Une rencontre éphémère.<br />
              Deux présences. Un geste commun.
            </p>
            {micError && (
              <p className="mic-error">
                {!navigator.mediaDevices
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
                <button className="enter-btn" onClick={handleEnter}>
                  Entrer
                </button>
              </>
            )}
          </div>
        )}

        {state !== STATE.INTRO && state !== STATE.ENDED && (
          <div className="experience">
            <div className="message-zone">
              {getMessage() && <p className="message">{getMessage()}</p>}
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
              <div className="connected-message">
                <p>Vous êtes ensemble.</p>
                <p className="connected-sub">Relâchez pour partir.</p>
              </div>
            )}
          </div>
        )}

        {state === STATE.ENDED && (
          <div className="ended">
            <p className="ended-text">Le portail s'est fermé.</p>
            <p className="ended-sub">Ce moment a existé.</p>
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
        }

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

        .instruction.granted {
          color: var(--cathedral-dim);
        }

        .mic-error {
          font-size: 0.8rem;
          color: #8a4a4a;
          letter-spacing: 0.08em;
        }

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

        .enter-btn:hover {
          border-color: var(--gold);
          color: var(--gold);
        }

        .experience {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .message-zone {
          height: 3rem;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 3rem;
        }

        .message {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(1rem, 2.5vw, 1.2rem);
          font-style: italic;
          color: var(--text-dim);
          letter-spacing: 0.05em;
          animation: fadeIn 0.6s ease;
          text-align: center;
        }

        .button-zone {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .portal-btn {
          position: relative;
          width: clamp(140px, 35vw, 220px);
          height: clamp(140px, 35vw, 220px);
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
          transition: background 0.8s ease, box-shadow 0.8s ease;
        }

        .portal-btn.waiting .btn-inner {
          background: var(--inactive);
          box-shadow: 0 0 0 1px var(--waiting);
          animation: breathe 3s ease-in-out infinite;
        }

        .portal-btn.ready .btn-inner {
          background: var(--inactive);
          box-shadow: 0 0 0 1px var(--gold-dim), 0 0 60px 0 rgba(201,185,154,0.08);
          animation: breathe-gold 2.5s ease-in-out infinite;
        }

        .portal-btn.partner-holding .btn-inner {
          background: rgba(201,185,154,0.06);
          box-shadow: 0 0 0 1px var(--gold), 0 0 80px 0 rgba(201,185,154,0.15);
          animation: none;
        }

        .portal-btn.holding .btn-inner {
          background: rgba(201,185,154,0.1);
          box-shadow: 0 0 0 1px var(--gold), 0 0 100px 0 rgba(201,185,154,0.2);
          animation: none;
        }

        .portal-btn.connected .btn-inner {
          background: rgba(126,184,201,0.08);
          box-shadow: 0 0 0 1px var(--cathedral), 0 0 120px 0 rgba(126,184,201,0.2), 0 0 200px 0 rgba(126,184,201,0.05);
          animation: none;
        }

        .connected-message {
          margin-top: 3rem;
          text-align: center;
          animation: fadeIn 1.5s ease;
        }

        .connected-message p {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(1rem, 2.5vw, 1.3rem);
          font-style: italic;
          color: var(--cathedral);
          letter-spacing: 0.08em;
        }

        .connected-sub {
          margin-top: 0.5rem;
          font-size: 0.75rem !important;
          color: var(--text-dim) !important;
          font-style: normal !important;
          letter-spacing: 0.15em !important;
          text-transform: uppercase;
        }

        .ended {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
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
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes breathe {
          0%, 100% { box-shadow: 0 0 0 1px var(--waiting); transform: scale(1); }
          50% { box-shadow: 0 0 0 1px var(--waiting), 0 0 50px 0 rgba(74,66,96,0.12); transform: scale(1.02); }
        }

        @keyframes breathe-gold {
          0%, 100% { box-shadow: 0 0 0 1px var(--gold-dim); transform: scale(1); }
          50% { box-shadow: 0 0 0 1px var(--gold), 0 0 70px 0 rgba(201,185,154,0.12); transform: scale(1.02); }
        }

        @media (prefers-reduced-motion: reduce) {
          .portal-btn .btn-inner { animation: none !important; }
        }
      `}</style>
    </>
  );
}

export default dynamic(() => Promise.resolve(Home), { ssr: false });
