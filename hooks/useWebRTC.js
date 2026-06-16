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

// localStreamRef is owned by the parent (index.js) so Safari iOS can populate
// it synchronously from a click handler before startCall is ever invoked.
export function useWebRTC(socketRef, localStreamRef) {
  const peerRef = useRef(null);
  const audioContextRef = useRef(null);
  const iceCandidateQueue = useRef([]);
  const remoteDescSet = useRef(false);

  const setupAudioPipeline = useCallback(async (remoteStream) => {
    console.log('[audio] setting up pipeline');
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    audioContextRef.current = audioContext;
    if (audioContext.state === 'suspended') await audioContext.resume();

    const convolver = await createCathedralReverb(audioContext);
    const source = audioContext.createMediaStreamSource(remoteStream);
    const gain = audioContext.createGain();
    gain.gain.value = 1.0;
    const dryGain = audioContext.createGain();
    dryGain.gain.value = 0.3;
    const wetGain = audioContext.createGain();
    wetGain.gain.value = 0.7;

    source.connect(dryGain);
    dryGain.connect(gain);
    source.connect(convolver);
    convolver.connect(wetGain);
    wetGain.connect(gain);
    gain.connect(audioContext.destination);
    console.log('[audio] pipeline ready');
  }, []);

  const startCall = useCallback(async (isInitiator) => {
    console.log('[webrtc] startCall, isInitiator:', isInitiator);
    iceCandidateQueue.current = [];
    remoteDescSet.current = false;

    if (!localStreamRef.current) {
      throw new Error('No microphone stream — was permission granted?');
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
      console.log('[webrtc] added local track:', track.kind);
    });

    peer.ontrack = async (event) => {
      console.log('[webrtc] ontrack fired');
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
      console.log('[webrtc] offer sent');
      socketRef.current?.emit('rtc-offer', { offer });
    }
  }, [setupAudioPipeline, socketRef, localStreamRef]);

  const handleOffer = useCallback(async ({ offer }) => {
    console.log('[webrtc] handleOffer');
    const peer = peerRef.current;
    if (!peer) { console.error('[webrtc] no peer for offer'); return; }
    await peer.setRemoteDescription(new RTCSessionDescription(offer));
    remoteDescSet.current = true;
    for (const c of iceCandidateQueue.current) {
      await peer.addIceCandidate(new RTCIceCandidate(c));
    }
    iceCandidateQueue.current = [];
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    console.log('[webrtc] answer sent');
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
      console.log('[webrtc] queuing ICE candidate');
      iceCandidateQueue.current.push(candidate);
      return;
    }
    try {
      await peer.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error('[webrtc] ICE add error:', e);
    }
  }, []);

  const stopCall = useCallback(() => {
    console.log('[webrtc] stopCall');
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
