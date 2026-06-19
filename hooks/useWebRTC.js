import { useRef, useCallback } from 'react';

async function createCathedralReverb(audioContext) {
  const sampleRate = audioContext.sampleRate;
  const duration = 4.0;
  const decay = 3.5;
  const length = sampleRate * duration;
  const impulse = audioContext.createBuffer(2, length, sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const channelData = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - t / duration, decay);
      if (i < sampleRate * 0.08) channelData[i] *= 2.5;
    }
  }
  const convolver = audioContext.createConvolver();
  convolver.buffer = impulse;
  return convolver;
}

function createHiddenAudioElement() {
  const el = document.createElement('audio');
  el.autoplay = true;
  el.playsInline = true;
  el.muted = false;
  Object.assign(el.style, { position: 'absolute', width: '0', height: '0', opacity: '0' });
  document.body.appendChild(el);
  return el;
}

// localStreamRef is owned by the parent so Safari iOS can populate it
// synchronously from a click handler before startCall is invoked.
export function useWebRTC(socketRef, localStreamRef) {
  const peerRef = useRef(null);
  const audioContextRef = useRef(null);
  const convolverRef = useRef(null);
  const remoteAudioElRef = useRef(null);
  const remoteReverbElRef = useRef(null);
  const localReverbElRef = useRef(null);
  const localSelfMonitorRef = useRef({ enabled: true, gainNode: null });
  // Preference set before pipeline is built — applied when pipeline starts
  const selfMonitorPrefRef = useRef(true);
  const iceCandidateQueue = useRef([]);
  const remoteDescSet = useRef(false);
  const iceServersCache = useRef(null);

  const setupAudioPipeline = useCallback(async (remoteStream) => {
    console.log('[audio] setting up pipeline');

    // Dry remote audio — primary playback via <audio> element
    const remoteAudioEl = createHiddenAudioElement();
    remoteAudioEl.srcObject = remoteStream;
    remoteAudioEl.volume = 0.45;
    remoteAudioElRef.current = remoteAudioEl;
    remoteAudioEl.play().catch(e => console.warn('[audio] remote play() failed:', e));
    console.log('[audio] remote <audio> attached');

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioContext = audioContextRef.current || new AudioCtx();
      audioContextRef.current = audioContext;
      if (audioContext.state === 'suspended') await audioContext.resume();

      // Shared convolver — used for both remote and local reverb
      const convolver = await createCathedralReverb(audioContext);
      convolverRef.current = convolver;

      // ── Remote reverb ──
      const remoteSource = audioContext.createMediaStreamSource(remoteStream);
      const remoteReverbDest = audioContext.createMediaStreamDestination();
      const remoteWetGain = audioContext.createGain();
      remoteWetGain.gain.value = 0.55;
      remoteSource.connect(convolver);
      convolver.connect(remoteWetGain);
      remoteWetGain.connect(remoteReverbDest);

      const remoteReverbEl = createHiddenAudioElement();
      remoteReverbEl.srcObject = remoteReverbDest.stream;
      remoteReverbElRef.current = remoteReverbEl;
      remoteReverbEl.play().catch(e => console.warn('[reverb] remote reverb play() failed:', e));

      // ── Local reverb (self-monitoring) ──
      if (localStreamRef.current) {
        const localSource = audioContext.createMediaStreamSource(localStreamRef.current);
        const localConvolver = await createCathedralReverb(audioContext);
        const localReverbDest = audioContext.createMediaStreamDestination();

        const localWetGain = audioContext.createGain();
        localWetGain.gain.value = 0.4;
        // Store gain node so toggle can mute/unmute without rebuilding pipeline
        localSelfMonitorRef.current.gainNode = localWetGain;
        // Apply preference set before pipeline was built
        localWetGain.gain.value = selfMonitorPrefRef.current ? 0.4 : 0;

        localSource.connect(localConvolver);
        localConvolver.connect(localWetGain);
        localWetGain.connect(localReverbDest);

        const localReverbEl = createHiddenAudioElement();
        localReverbEl.srcObject = localReverbDest.stream;
        localReverbElRef.current = localReverbEl;
        localReverbEl.play().catch(e => console.warn('[reverb] local reverb play() failed:', e));
        console.log('[audio] local self-monitoring with reverb started');
      }

      console.log('[audio] pipeline ready');
    } catch (e) {
      console.warn('[audio] reverb setup failed, dry audio still playing:', e);
    }
  }, [localStreamRef]);

  // Toggle self-monitoring on/off without rebuilding the pipeline
  const setSelfMonitor = useCallback((enabled) => {
    selfMonitorPrefRef.current = enabled;
    localSelfMonitorRef.current.enabled = enabled;
    const gainNode = localSelfMonitorRef.current.gainNode;
    if (gainNode) {
      gainNode.gain.value = enabled ? 0.4 : 0;
      console.log('[audio] self-monitor:', enabled ? 'on' : 'off');
    }
    if (localReverbElRef.current) {
      localReverbElRef.current.muted = !enabled;
    }
  }, []);

  // Call this when partner arrives — preloads ICE servers so startCall has no fetch delay
  const prefetchIceServers = useCallback(async () => {
    try {
      const res = await fetch('/api/turn');
      const data = await res.json();
      if (data.iceServers) {
        iceServersCache.current = data.iceServers;
        console.log('[webrtc] ICE servers prefetched:', data.iceServers.length);
      }
    } catch (e) {
      console.warn('[webrtc] ICE prefetch failed:', e);
    }
  }, []);

  const startCall = useCallback(async (isInitiator) => {
    console.log('[webrtc] startCall, isInitiator:', isInitiator);
    iceCandidateQueue.current = [];
    remoteDescSet.current = false;

    if (!localStreamRef.current) {
      throw new Error('No microphone stream — was permission granted?');
    }

    // Create AudioContext during user gesture
    if (!audioContextRef.current) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      if (ctx.state === 'suspended') {
        try { await ctx.resume(); } catch(e) {}
      }
      console.log('[audio] AudioContext created, state:', ctx.state);
    }

    // Use prefetched ICE servers if available, otherwise fetch now
    let iceServers = iceServersCache.current;
    if (!iceServers) {
      console.log('[webrtc] ICE servers not prefetched, fetching now...');
      try {
        const res = await fetch('/api/turn');
        const data = await res.json();
        iceServers = data.iceServers || null;
      } catch (e) {
        console.warn('[webrtc] Failed to fetch TURN config, using STUN only:', e);
      }
    }
    if (!iceServers) {
      iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ];
    }
    console.log('[webrtc] using ICE servers:', iceServers.length);

    const peer = new RTCPeerConnection({ iceServers });
    peerRef.current = peer;

    localStreamRef.current.getTracks().forEach(track => {
      peer.addTrack(track, localStreamRef.current);
    });

    // Store remote stream when track arrives, play only after ICE connected
    let pendingRemoteStream = null;

    peer.ontrack = (event) => {
      console.log('[webrtc] ontrack fired, ICE state:', peer.iceConnectionState);
      pendingRemoteStream = event.streams[0];
      if (peer.iceConnectionState === 'connected' || peer.iceConnectionState === 'completed') {
        if (pendingRemoteStream) setupAudioPipeline(pendingRemoteStream);
      }
    };

    peer.onicecandidate = (event) => {
      if (event.candidate) socketRef.current?.emit('rtc-ice', { candidate: event.candidate });
    };

    peer.oniceconnectionstatechange = () => {
      console.log('[webrtc] ICE state:', peer.iceConnectionState);
      if ((peer.iceConnectionState === 'connected' || peer.iceConnectionState === 'completed') && pendingRemoteStream) {
        setupAudioPipeline(pendingRemoteStream);
        pendingRemoteStream = null;
      }
    };

    peer.onconnectionstatechange = () => {
      console.log('[webrtc] connection state:', peer.connectionState);
    };

    if (isInitiator) {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socketRef.current?.emit('rtc-offer', { offer });
    }
  }, [setupAudioPipeline, socketRef, localStreamRef]);

  const handleOffer = useCallback(async ({ offer }) => {
    const peer = peerRef.current;
    if (!peer) return;
    await peer.setRemoteDescription(new RTCSessionDescription(offer));
    remoteDescSet.current = true;
    for (const c of iceCandidateQueue.current) await peer.addIceCandidate(new RTCIceCandidate(c));
    iceCandidateQueue.current = [];
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    socketRef.current?.emit('rtc-answer', { answer });
  }, [socketRef]);

  const handleAnswer = useCallback(async ({ answer }) => {
    const peer = peerRef.current;
    if (!peer) return;
    await peer.setRemoteDescription(new RTCSessionDescription(answer));
    remoteDescSet.current = true;
    for (const c of iceCandidateQueue.current) await peer.addIceCandidate(new RTCIceCandidate(c));
    iceCandidateQueue.current = [];
  }, []);

  const handleIce = useCallback(async ({ candidate }) => {
    const peer = peerRef.current;
    if (!peer || !candidate) return;
    if (!remoteDescSet.current) { iceCandidateQueue.current.push(candidate); return; }
    try { await peer.addIceCandidate(new RTCIceCandidate(candidate)); }
    catch (e) { console.error('[webrtc] ICE error:', e); }
  }, []);

  const stopCall = useCallback(() => {
    console.log('[webrtc] stopCall');
    [remoteAudioElRef, remoteReverbElRef, localReverbElRef].forEach(ref => {
      if (ref.current) { ref.current.srcObject = null; ref.current.remove(); ref.current = null; }
    });
    document.querySelectorAll('audio').forEach(el => { el.srcObject = null; el.remove(); });
    // Do NOT stop localStreamRef tracks here — the mic stream belongs to the
    // user session, not to this call. stopCall can be called between rooms
    // and the stream must remain alive for the next connection.
    if (peerRef.current) { peerRef.current.close(); peerRef.current = null; }
    if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
    convolverRef.current = null;
    localSelfMonitorRef.current = { enabled: true, gainNode: null };
    selfMonitorPrefRef.current = true;
    iceCandidateQueue.current = [];
    remoteDescSet.current = false;
  }, [localStreamRef]);

  return { prefetchIceServers, startCall, stopCall, handleOffer, handleAnswer, handleIce, setSelfMonitor };
}
