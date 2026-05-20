import { useCallback, useEffect, useRef, useState } from 'react';
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
    /* fallback below */
  }

  if (!pageIsHttps) {
    return { url: 'ws://localhost:8080', error: null };
  }

  return {
    url: null,
    error:
      'Server not configured. Ask the host to set up signaling, then try again.',
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
  const cleanupSessionRef = useRef(() => {});
  const leaveIntentionalRef = useRef(false);

  const [roomId] = useState(() => getRoomId());
  const [sessionKey, setSessionKey] = useState(0);
  const [uiPhase, setUiPhase] = useState('loading');
  const [statusMessage, setStatusMessage] = useState('Getting ready…');
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [copyToast, setCopyToast] = useState(false);

  useEffect(() => {
    document.title = `Video Chat · ${roomId}`;
  }, [roomId]);

  const clearRemoteVideo = useCallback(() => {
    setHasRemoteVideo(false);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, []);

  const hangUp = useCallback(() => {
    leaveIntentionalRef.current = true;
    cleanupSessionRef.current();
    clearRemoteVideo();
    setUiPhase('ended');
    setStatusMessage('You left the call');
  }, [clearRemoteVideo]);

  const copyRoomLink = useCallback(async () => {
    const link = window.location.href;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const input = document.createElement('textarea');
      input.value = link;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setCopyToast(true);
    window.setTimeout(() => setCopyToast(false), 2500);
  }, []);

  const rejoin = useCallback(() => {
    leaveIntentionalRef.current = false;
    setSessionKey((k) => k + 1);
    setUiPhase('loading');
    setStatusMessage('Getting ready…');
    clearRemoteVideo();
  }, [clearRemoteVideo]);

  useEffect(() => {
    let cancelled = false;
    leaveIntentionalRef.current = false;

    function cleanupPeerAndSocket() {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
    }

    function cleanupAll() {
      cleanupPeerAndSocket();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
    }

    cleanupSessionRef.current = () => {
      cancelled = true;
      cleanupAll();
      clearRemoteVideo();
    };

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
          setHasRemoteVideo(true);
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          send({ type: 'ice-candidate', candidate: event.candidate });
        }
      };

      pc.onconnectionstatechange = () => {
        if (cancelled) return;
        const state = pc.connectionState;
        if (state === 'connected') {
          setUiPhase('in-call');
        } else if (state === 'connecting') {
          setUiPhase('connecting');
          setStatusMessage('Connecting…');
        } else if (state === 'disconnected' || state === 'failed') {
          setUiPhase('peer-left');
          setStatusMessage('Call ended');
          clearRemoteVideo();
          cleanupPeerAndSocket();
        }
      };

      return pc;
    }

    async function startCallAsInitiator() {
      setUiPhase('connecting');
      setStatusMessage('Connecting…');
      const pc = createPeerConnection();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send({ type: 'offer', sdp: offer });
    }

    async function handleOffer(sdp) {
      setUiPhase('connecting');
      setStatusMessage('Connecting…');
      const pc = createPeerConnection();
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send({ type: 'answer', sdp: answer });
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
        setUiPhase('loading');
        setStatusMessage('Allow camera and microphone…');

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

        setStatusMessage('Connecting to server…');
        const { url: wsUrl, error: wsConfigError } =
          await resolveSignalingWsUrl();
        if (cancelled) return;
        if (!wsUrl) {
          setUiPhase('error');
          setStatusMessage(wsConfigError);
          return;
        }

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (cancelled) return;
          setUiPhase('waiting');
          setStatusMessage('Waiting for someone to join');
          send({ type: 'join', roomId });
        };

        ws.onmessage = async (event) => {
          const msg = JSON.parse(event.data);

          switch (msg.type) {
            case 'joined':
              isInitiatorRef.current = msg.role === 'initiator';
              if (msg.waiting) {
                setUiPhase('waiting');
                setStatusMessage('Waiting for someone to join');
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
              cleanupPeerAndSocket();
              clearRemoteVideo();
              setUiPhase('peer-left');
              setStatusMessage('They left — share your link to invite someone');
              break;
            case 'error':
              setUiPhase('error');
              setStatusMessage(
                msg.message === 'Room is full. Only 2 people per room.'
                  ? 'This room is full. Create a new link.'
                  : msg.message
              );
              break;
            default:
              break;
          }
        };

        ws.onclose = () => {
          if (cancelled || leaveIntentionalRef.current) return;
          setUiPhase('error');
          setStatusMessage('Lost connection to server. Tap Try again.');
        };

        ws.onerror = () => {
          if (cancelled) return;
          setUiPhase('error');
          setStatusMessage('Could not reach server. Tap Try again.');
        };
      } catch (err) {
        if (cancelled) return;
        setUiPhase('error');
        setStatusMessage(
          err.name === 'NotAllowedError'
            ? 'Camera and microphone access is required'
            : 'Could not start video'
        );
      }
    }

    start();

    return () => {
      cancelled = true;
      cleanupAll();
    };
  }, [sessionKey, roomId, clearRemoteVideo]);

  const showWaitingOverlay =
    uiPhase === 'waiting' ||
    uiPhase === 'peer-left' ||
    (uiPhase === 'connecting' && !hasRemoteVideo);

  const showStatusBar = uiPhase !== 'in-call';
  const showControls = uiPhase !== 'loading' && uiPhase !== 'error';

  return (
    <div className="app">
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className={`video remote ${hasRemoteVideo ? 'visible' : ''}`}
      />

      {showWaitingOverlay && (
        <div className="waiting-overlay" aria-live="polite">
          <div className="waiting-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="waiting-title">
            {uiPhase === 'peer-left' ? 'Waiting for someone' : 'Share link to start'}
          </p>
          <p className="waiting-sub">
            Send this room link to the person you want to call
          </p>
          <p className="waiting-room">Room · {roomId}</p>
        </div>
      )}

      <video
        ref={localVideoRef}
        autoPlay
        muted
        playsInline
        className="video local"
      />

      {uiPhase === 'in-call' && (
        <div className="connected-badge" aria-label="Connected">
          <span className="connected-dot" />
          Connected
        </div>
      )}

      {showStatusBar && (
        <p className="status-bar" role="status">
          {statusMessage}
        </p>
      )}

      <div className="control-bar">
        {uiPhase === 'ended' || uiPhase === 'error' ? (
          <button type="button" className="btn btn-primary" onClick={rejoin}>
            {uiPhase === 'error' ? 'Try again' : 'Rejoin room'}
          </button>
        ) : (
          showControls && (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={copyRoomLink}
              >
                Copy link
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={hangUp}
                disabled={uiPhase === 'loading'}
              >
                Leave call
              </button>
            </>
          )
        )}
      </div>

      {copyToast && (
        <div className="toast" role="status">
          Link copied
        </div>
      )}
    </div>
  );
}

export default App;
