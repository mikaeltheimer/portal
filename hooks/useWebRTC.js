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

export function useWebRTC(socketRef, localStreamRef) {
  const peerRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioElementRef = useRef(null); // <audio> element for reliable playback
  const iceCandidateQueue = useRef([]);
  const remoteDescSet = useRef(false);

  const setupAudioPipeline = useCallback(async (remoteStream) => {
    console.log('[audio] setting up pipeline');

    // PRIMARY: attach stream to an <audio> element — the only reliable
    // cross-browser / cross-device way to play WebRTC audio.
    const audioEl = document.createElement('audio');
    audioEl.srcObject = remoteStream;
    audioEl.autoplay = true;
    audioEl.playsInline = true;   // critical for iOS
    audioEl.muted = false;
    audioEl.volume = 1.0;
    // Hide but keep in DOM — required for playback to work
    audioEl.style.position = 'absolute';
    audioEl.style.width = '0';
    audioEl.style.height = '0';
    audioEl.style.opacity = '0';
    document.body.appendChild(audioEl);
    audioElementRef.current = audioEl;

    audioEl.play().catch((e) => console.warn('[audio] play() failed:', e));
    console.log('[audio] <audio> element attached and playing');

    // SECONDARY: add reverb via Web Audio API on top
    // We use a MediaStreamDestination to merge reverb back into a stream,
    // then play it through a second audio element at lower volume.
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioContext = audioContextRef.current || new AudioCtx();
      audioContextRef.current = audioContext;

      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const convolver = await createCathedralReverb(audioContext);
      const source = audioContext.createMediaStreamSource(remoteStream);

      // Route only the wet (reverb) signal to a separate audio element
      const reverbDest = audioContext.createMediaStreamDestination();
      const wetGain = audioContext.createGain();
      wetGain.gain.value = 0.55;

      source.connect(convolver);
      convolver.connect(wetGain);
      wetGain.connect(reverbDest);

      // Lower the dry audio element volume so reverb is audible
      audioEl.volume = 0.45;

      const reverbEl = document.createElement('audio');
      reverbEl.srcObject = reverbDest.stream;
      reverbEl.autoplay = true;
      reverbEl.playsInline = true;
      reverbEl.muted = false;
      reverbEl.style.position = 'absolute';
      reverbEl.style.width = '0';
      reverbEl.style.height = '0';
      reverbEl.style.opacity = '0';
      document.body.appendChild(reverbEl);
      reverbEl.play().catch((e) => console.warn('[reverb] play() failed:', e));
      console.log('[audio] reverb layer added');
    } catch (e) {
      console.warn('[audio] reverb setup failed, dry audio still playing:', e);
      // Dry audio via the first element still works — reverb is a bonus
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
    }

    const peer = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
      ],
    });
    peerRef.current = peer;

    localStreamRef.current.getTracks().forEach((track) => {
      peer.addTrack(track, localStreamRef.current);
    });

    peer.ontrack = async (event) => {
      console.log('[webrtc] ontrack fired, streams:', event.streams.length);
      const remoteStream = event.streams[0];
      if (remoteStream) await setupAudioPipeline(remoteStream);
    };

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit('rtc-ice', { candidate: event.candidate });
      }
    };

    peer.oniceconnectionstatechange = () => {
      console.log('[webrtc] ICE state:', peer.iceConnectionState);
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
    console.log('[webrtc] handleOffer');
    const peer = peerRef.current;
    if (!peer) return;
    await peer.setRemoteDescription(new RTCSessionDescription(offer));
    remoteDescSet.current = true;
    for (const c of iceCandidateQueue.current) {
      await peer.addIceCandidate(new RTCIceCandidate(c));
    }
    iceCandidateQueue.current = [];
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    socketRef.current?.emit('rtc-answer', { answer });
  }, [socketRef]);

  const handleAnswer = useCallback(async ({ answer }) => {
    console.log('[webrtc] handleAnswer');
    const peer = peerRef.current;
    if (!peer) return;
    await peer.setRemoteDescription(new RTCSessionDescription(answer));
    remoteDescSet.current = true;
    for (const c of iceCandidateQueue.current) {
      await peer.addIceCandidate(new RTCIceCandidate(c));
    }
    iceCandidateQueue.current = [];
  }, []);

  const handleIce = useCallback(async ({ candidate }) => {
    const peer = peerRef.current;
    if (!peer || !candidate) return;
    if (!remoteDescSet.current) {
      iceCandidateQueue.current.push(candidate);
      return;
    }
    try {
      await peer.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error('[webrtc] ICE error:', e);
    }
  }, []);

  const stopCall = useCallback(() => {
    console.log('[webrtc] stopCall');
    // Remove audio elements from DOM
    if (audioElementRef.current) {
      audioElementRef.current.srcObject = null;
      audioElementRef.current.remove();
      audioElementRef.current = null;
    }
    // Remove any reverb elements
    document.querySelectorAll('audio').forEach(el => {
      el.srcObject = null;
      el.remove();
    });
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    iceCandidateQueue.current = [];
    remoteDescSet.current = false;
  }, [localStreamRef]);

  return { startCall, stopCall, handleOffer, handleAnswer, handleIce };
}
