import { useEffect, useRef, useState } from 'react';
import './App.css';

function normalizeWsUrl(raw, pageIsHttps) {
  let url = (raw || '').trim();
  if (!url) return null;

  if (url.startsWith('https://')) {
    url = 'wss://' + url.slice('https://'.length);
  } else if (url.startsWith('http://')) {
    url = 'ws://' + url.slice('http://'.length);
  }

  if (pageIsHttps && url.startsWith('ws://')) {
    url = 'wss://' + url.slice('ws://'.length);
  }

  return url;
}

/** Env var (build time) or /signaling.json (edit file, push, redeploy). */
async function resolveSignalingWsUrl() {
  const pageIsHttps = window.location.protocol === 'https:';

  const fromEnv = normalizeWsUrl(
    process.env.REACT_APP_WS_URL || '',
    pageIsHttps
  );
  if (fromEnv) return { url: fromEnv, error: null };

  try {
    const res = await fetch('/signaling.json', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      const fromFile = normalizeWsUrl(data.wsUrl || '', pageIsHttps);
      if (fromFile) return { url: fromFile, error: null };
    }
  } catch {
    /* use fallback message below */
  }

  if (!pageIsHttps) {
    return { url: 'ws://localhost:8080', error: null };
  }

  return {
    url: null,
    error:
      'Missing signaling URL. Fix one: (1) Vercel → Settings → Environment Variables → REACT_APP_WS_URL = wss://YOUR-APP.onrender.com → Redeploy. Or (2) edit vchat/public/signaling.json, push to GitHub, redeploy.',
  };
}

const ICE_SERVERS = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

function getRoomId() {
  const params = new URLSearchParams(window.location.search);
  let room = params.get('room');
  if (!room) {
    room = Math.random().toString(36).slice(2, 9);
    const url = new URL(window.location.href);
    url.searchParams.set('room', room);
    window.history.replaceState({}, '', url);
  }
  return room;
}

function App() {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const wsRef = useRef(null);
  const localStreamRef = useRef(null);
  const isInitiatorRef = useRef(false);
  const [status, setStatus] = useState('Starting...');

  useEffect(() => {
    let cancelled = false;
    const roomId = getRoomId();

    function cleanup() {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
    }

    function send(payload) {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(payload));
      }
    }

    function createPeerConnection() {
      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      }

      pc.ontrack = (event) => {
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          send({ type: 'ice-candidate', candidate: event.candidate });
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === 'connected') {
          setStatus('Connected');
        } else if (state === 'connecting') {
          setStatus('Connecting to peer...');
        } else if (state === 'disconnected' || state === 'failed') {
          setStatus('Peer disconnected');
        }
      };

      return pc;
    }

    async function startCallAsInitiator() {
      const pc = createPeerConnection();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send({ type: 'offer', sdp: offer });
      setStatus('Calling peer...');
    }

    async function handleOffer(sdp) {
      const pc = createPeerConnection();
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send({ type: 'answer', sdp: answer });
      setStatus('Answering...');
    }

    async function handleAnswer(sdp) {
      if (pcRef.current) {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
      }
    }

    async function handleIceCandidate(candidate) {
      if (pcRef.current && candidate) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    }

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        setStatus('Connecting to signaling server...');
        const { url: wsUrl, error: wsConfigError } =
          await resolveSignalingWsUrl();
        if (cancelled) return;
        if (!wsUrl) {
          setStatus(wsConfigError);
          return;
        }

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setStatus('Waiting for peer...');
          send({ type: 'join', roomId });
        };

        ws.onmessage = async (event) => {
          const msg = JSON.parse(event.data);

          switch (msg.type) {
            case 'joined':
              isInitiatorRef.current = msg.role === 'initiator';
              if (msg.waiting) {
                setStatus(`Room: ${roomId} — share this link and wait`);
              }
              break;
            case 'peer-joined':
              if (isInitiatorRef.current) {
                await startCallAsInitiator();
              }
              break;
            case 'offer':
              await handleOffer(msg.sdp);
              break;
            case 'answer':
              await handleAnswer(msg.sdp);
              break;
            case 'ice-candidate':
              await handleIceCandidate(msg.candidate);
              break;
            case 'peer-left':
              if (pcRef.current) {
                pcRef.current.close();
                pcRef.current = null;
              }
              if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = null;
              }
              setStatus('Peer left — waiting for someone to join');
              break;
            case 'error':
              setStatus(msg.message);
              break;
            default:
              break;
          }
        };

        ws.onclose = () => {
          if (!cancelled) {
            setStatus(
              window.location.protocol === 'https:'
                ? 'Disconnected from signaling server. Check REACT_APP_WS_URL is wss://your-render-host (no https://) and redeploy after changing env.'
                : 'Disconnected from server'
            );
          }
        };

        ws.onerror = () => {
          if (!cancelled) {
            setStatus(
              window.location.protocol === 'https:'
                ? 'Cannot open WebSocket. Use wss:// to your Render URL in REACT_APP_WS_URL, then redeploy.'
                : 'Cannot reach signaling server. Run the server (npm start in server/) on port 8080.'
            );
          }
        };
      } catch (err) {
        setStatus(
          err.name === 'NotAllowedError'
            ? 'Allow camera and microphone access'
            : err.message || 'Could not start video'
        );
      }
    }

    start();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  return (
    <div className="app">
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className="video remote"
      />
      <video
        ref={localVideoRef}
        autoPlay
        muted
        playsInline
        className="video local"
      />
      <p className="status">{status}</p>
    </div>
  );
}

export default App;
