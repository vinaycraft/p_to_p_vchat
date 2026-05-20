import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import {
  IconFlip,
  IconFullscreen,
  IconLink,
  IconMic,
  IconPhoneDown,
  IconPip,
  IconUser,
  IconVideo,
} from './icons';

function playJoinChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 784;
    gain.gain.value = 0.12;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
    osc.onended = () => ctx.close();
  } catch {
    /* audio optional */
  }
}

function vibrateJoin() {
  if (typeof navigator.vibrate === 'function') {
    navigator.vibrate([60, 40, 60]);
  }
}

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

const CONTROLS_HIDE_MS = 3000;

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

function LoadingOverlay({ message }) {
  return (
    <div className="loading-overlay" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <p className="loading-title">Setting up your call</p>
      <p className="loading-message">{message}</p>
    </div>
  );
}

function getPanelContent(phase, message) {
  if (phase === 'ended') {
    return {
      title: 'You left the call',
      message: 'Share your room link anytime to start a new call.',
      actionLabel: 'Rejoin room',
    };
  }
  if (message.includes('Camera and microphone')) {
    return {
      title: 'Allow camera & microphone',
      message:
        'Open your browser settings for this site and allow access, then try again.',
      actionLabel: 'Try again',
    };
  }
  if (message.includes('Room is full')) {
    return {
      title: 'Room is full',
      message: 'Only two people can join. Open a new link to start another room.',
      actionLabel: 'Try again',
    };
  }
  if (message.includes('Server not configured')) {
    return {
      title: 'Cannot connect',
      message: message,
      actionLabel: 'Try again',
    };
  }
  return {
    title: 'Something went wrong',
    message: message,
    actionLabel: 'Try again',
  };
}

function ErrorPanel({ phase, message, onAction }) {
  const { title, message: body, actionLabel } = getPanelContent(phase, message);
  return (
    <div className="error-panel" role="alert">
      <div className="error-card">
        <h2 className="error-title">{title}</h2>
        <p className="error-message">{body}</p>
        <button type="button" className="btn btn-primary" onClick={onAction}>
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  active,
  variant,
  children,
  pressed,
}) {
  const ariaPressed =
    pressed !== undefined ? pressed : active ? true : undefined;

  return (
    <button
      type="button"
      className={`icon-btn ${variant || ''} ${active ? 'is-off' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={ariaPressed}
    >
      {children}
    </button>
  );
}

function App() {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const videoStageRef = useRef(null);
  const joinNotifiedRef = useRef(false);
  const pcRef = useRef(null);
  const wsRef = useRef(null);
  const localStreamRef = useRef(null);
  const isInitiatorRef = useRef(false);
  const cleanupSessionRef = useRef(() => {});
  const leaveIntentionalRef = useRef(false);
  const facingModeRef = useRef('user');
  const hideControlsTimerRef = useRef(null);
  const flipInProgressRef = useRef(false);

  const [roomId] = useState(() => getRoomId());
  const [sessionKey, setSessionKey] = useState(0);
  const [uiPhase, setUiPhase] = useState('loading');
  const [statusMessage, setStatusMessage] = useState('Getting ready…');
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [copyToast, setCopyToast] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [canFlipCamera, setCanFlipCamera] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [viewsSwapped, setViewsSwapped] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const supportsPip =
    typeof document !== 'undefined' &&
    'pictureInPictureEnabled' in document &&
    document.pictureInPictureEnabled;

  useEffect(() => {
    document.title = `Video Chat · ${roomId}`;
  }, [roomId]);

  useEffect(() => {
    const constraints = navigator.mediaDevices?.getSupportedConstraints?.();
    setCanFlipCamera(!!constraints?.facingMode);
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () =>
      document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const resetJoinNotification = useCallback(() => {
    joinNotifiedRef.current = false;
  }, []);

  const notifyPeerJoined = useCallback(() => {
    if (joinNotifiedRef.current) return;
    joinNotifiedRef.current = true;
    playJoinChime();
    vibrateJoin();
    setAnnouncement('Someone joined the call');
    window.setTimeout(() => setAnnouncement(''), 4000);
  }, []);

  const clearRemoteVideo = useCallback(() => {
    setHasRemoteVideo(false);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, []);

  const scheduleHideControls = useCallback(() => {
    if (hideControlsTimerRef.current) {
      clearTimeout(hideControlsTimerRef.current);
    }
    hideControlsTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
    }, CONTROLS_HIDE_MS);
  }, []);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    scheduleHideControls();
  }, [scheduleHideControls]);

  useEffect(() => {
    if (uiPhase === 'in-call') {
      revealControls();
      return () => {
        if (hideControlsTimerRef.current) {
          clearTimeout(hideControlsTimerRef.current);
        }
      };
    }
    setControlsVisible(true);
    if (hideControlsTimerRef.current) {
      clearTimeout(hideControlsTimerRef.current);
    }
  }, [uiPhase, revealControls]);

  const hangUp = useCallback(() => {
    leaveIntentionalRef.current = true;
    cleanupSessionRef.current();
    clearRemoteVideo();
    setIsMuted(false);
    setIsVideoOff(false);
    setViewsSwapped(false);
    resetJoinNotification();
    setUiPhase('ended');
    setStatusMessage('You left the call');
  }, [clearRemoteVideo, resetJoinNotification]);

  useEffect(() => {
    if (!hasRemoteVideo) {
      setViewsSwapped(false);
    }
  }, [hasRemoteVideo]);

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
    revealControls();
  }, [revealControls]);

  const getMainVideoEl = useCallback(() => {
    if (viewsSwapped) return localVideoRef.current;
    return hasRemoteVideo ? remoteVideoRef.current : localVideoRef.current;
  }, [viewsSwapped, hasRemoteVideo]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await (videoStageRef.current || document.documentElement).requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      /* unsupported */
    }
    revealControls();
  }, [revealControls]);

  const togglePip = useCallback(async () => {
    const video = getMainVideoEl();
    if (!video) return;
    try {
      if (document.pictureInPictureElement === video) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        await video.requestPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch {
      /* unsupported or no video yet */
    }
    revealControls();
  }, [getMainVideoEl, revealControls]);

  useEffect(() => {
    const onPipChange = () => {
      setPipActive(!!document.pictureInPictureElement);
    };
    document.addEventListener('enterpictureinpicture', onPipChange);
    document.addEventListener('leavepictureinpicture', onPipChange);
    return () => {
      document.removeEventListener('enterpictureinpicture', onPipChange);
      document.removeEventListener('leavepictureinpicture', onPipChange);
    };
  }, []);

  const rejoin = useCallback(() => {
    leaveIntentionalRef.current = false;
    setIsMuted(false);
    setIsVideoOff(false);
    setViewsSwapped(false);
    resetJoinNotification();
    facingModeRef.current = 'user';
    setSessionKey((k) => k + 1);
    setUiPhase('loading');
    setStatusMessage('Getting ready…');
    clearRemoteVideo();
  }, [clearRemoteVideo]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    const track = stream?.getAudioTracks()[0];
    if (!track) return;
    const next = !track.enabled;
    track.enabled = next;
    setIsMuted(!next);
    revealControls();
  }, [revealControls]);

  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current;
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    const next = !track.enabled;
    track.enabled = next;
    setIsVideoOff(!next);
    revealControls();
  }, [revealControls]);

  const replaceVideoTrack = useCallback(async (newTrack) => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const oldTrack = stream.getVideoTracks()[0];
    if (oldTrack) {
      stream.removeTrack(oldTrack);
      oldTrack.stop();
    }
    stream.addTrack(newTrack);
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    const sender = pcRef.current
      ?.getSenders()
      .find((s) => s.track?.kind === 'video');
    if (sender) {
      await sender.replaceTrack(newTrack);
    }
  }, []);

  const flipCamera = useCallback(async () => {
    if (flipInProgressRef.current || isVideoOff) return;
    const stream = localStreamRef.current;
    if (!stream?.getVideoTracks()[0]) return;

    flipInProgressRef.current = true;
    const nextFacing =
      facingModeRef.current === 'user' ? 'environment' : 'user';

    const tryGetVideo = async (constraint) => {
      const media = await navigator.mediaDevices.getUserMedia({
        video: constraint,
        audio: false,
      });
      return media.getVideoTracks()[0];
    };

    try {
      let newTrack;
      try {
        newTrack = await tryGetVideo({ facingMode: { exact: nextFacing } });
      } catch {
        newTrack = await tryGetVideo({ facingMode: nextFacing });
      }
      await replaceVideoTrack(newTrack);
      facingModeRef.current = nextFacing;
    } catch {
      /* device may not support flip */
    } finally {
      flipInProgressRef.current = false;
      revealControls();
    }
  }, [isVideoOff, replaceVideoTrack, revealControls]);

  const handleAppPointer = useCallback(() => {
    if (uiPhase === 'in-call') {
      revealControls();
    }
  }, [uiPhase, revealControls]);

  const canSwapViews =
    hasRemoteVideo && (uiPhase === 'in-call' || uiPhase === 'connecting');

  const handleSwapViews = useCallback(() => {
    if (!canSwapViews) return;
    setViewsSwapped((s) => !s);
    revealControls();
  }, [canSwapViews, revealControls]);

  useEffect(() => {
    let cancelled = false;
    leaveIntentionalRef.current = false;
    joinNotifiedRef.current = false;

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
          video: { facingMode: 'user' },
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        facingModeRef.current = 'user';
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
              notifyPeerJoined();
              if (isInitiatorRef.current) {
                await startCallAsInitiator();
              }
              break;
            case 'offer':
              notifyPeerJoined();
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
              resetJoinNotification();
              setUiPhase('peer-left');
              setStatusMessage('They left — share your link to invite someone');
              setAnnouncement('The other person left the call');
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
  }, [sessionKey, roomId, clearRemoteVideo, notifyPeerJoined, resetJoinNotification]);

  const showWaitingOverlay =
    uiPhase === 'waiting' ||
    uiPhase === 'peer-left' ||
    (uiPhase === 'connecting' && !hasRemoteVideo);

  const showLoadingOverlay = uiPhase === 'loading' || uiPhase === 'connecting';
  const showErrorPanel = uiPhase === 'error' || uiPhase === 'ended';
  const showStatusBar =
    !showErrorPanel &&
    uiPhase !== 'in-call' &&
    !showLoadingOverlay;
  const showSessionControls =
    uiPhase !== 'loading' &&
    uiPhase !== 'error' &&
    uiPhase !== 'ended';
  const hideControlsBar = uiPhase === 'in-call' && !controlsVisible;
  const hasLocalStream =
    uiPhase !== 'loading' && uiPhase !== 'error' && uiPhase !== 'ended';
  const showRoomHeader =
    uiPhase !== 'loading' && uiPhase !== 'error' && uiPhase !== 'ended';

  const showMediaControls =
    hasLocalStream &&
    (uiPhase === 'in-call' || uiPhase === 'connecting' || hasRemoteVideo);

  return (
    <div
      className="app"
      role="application"
      aria-label="Video chat"
      onPointerDown={handleAppPointer}
    >
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      {showLoadingOverlay && (
        <LoadingOverlay message={statusMessage} />
      )}

      {showErrorPanel && (
        <ErrorPanel
          phase={uiPhase}
          message={statusMessage}
          onAction={rejoin}
        />
      )}

      <div
        ref={videoStageRef}
        className={`video-stage ${viewsSwapped ? 'is-swapped' : ''} ${
          hasRemoteVideo ? 'has-remote' : ''
        } ${isFullscreen ? 'is-fullscreen' : ''}`}
      >
        <div
          className={`video-slot slot-remote ${
            viewsSwapped && hideControlsBar ? 'controls-hidden-pip' : ''
          }`}
        >
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={`video ${hasRemoteVideo ? 'visible' : ''}`}
          />
        </div>

        <div
          className={`video-slot slot-local ${isVideoOff ? 'camera-off' : ''} ${
            hideControlsBar ? 'controls-hidden-pip' : ''
          } ${canSwapViews ? 'can-swap' : ''}`}
          onClick={handleSwapViews}
          onKeyDown={(e) => {
            if (canSwapViews && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              handleSwapViews();
            }
          }}
          role={canSwapViews ? 'button' : undefined}
          tabIndex={canSwapViews ? 0 : undefined}
          aria-label={
            canSwapViews
              ? viewsSwapped
                ? 'Tap to show guest full screen'
                : 'Tap to show your camera full screen'
              : undefined
          }
        >
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="video"
          />
          {isVideoOff && (
            <div className="camera-off-overlay" aria-hidden="true">
              <IconUser />
            </div>
          )}
          {canSwapViews && (
            <span className="swap-hint" aria-hidden="true">
              Tap to swap
            </span>
          )}
        </div>
      </div>

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
          {uiPhase === 'peer-left' && (
            <div className="waiting-actions">
              <p className="waiting-reconnect-hint">
                Invite them back with the same room link
              </p>
              <button
                type="button"
                className="btn btn-secondary waiting-copy-btn"
                onClick={copyRoomLink}
              >
                Copy link again
              </button>
            </div>
          )}
        </div>
      )}

      {showRoomHeader && (
        <header
          className={`room-header ${hideControlsBar ? 'ui-faded' : ''}`}
        >
          <span className="room-header-label">Room</span>
          <span className="room-header-id">{roomId}</span>
        </header>
      )}

      {uiPhase === 'in-call' && (
        <div
          className={`connected-badge ${hideControlsBar ? 'ui-faded' : ''}`}
          aria-label="Connected"
        >
          <span className="connected-dot" />
          Connected
        </div>
      )}

      {showStatusBar && (
        <p className={`status-bar ${hideControlsBar ? 'ui-faded' : ''}`} role="status">
          {statusMessage}
        </p>
      )}

      <div
        className={`control-bar ${hideControlsBar ? 'controls-hidden' : ''}`}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {showSessionControls && (
            <div className="control-row">
              <IconButton label="Copy room link" onClick={copyRoomLink}>
                <IconLink />
              </IconButton>
              {hasLocalStream && (
                <>
                  <IconButton
                    label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                    onClick={toggleMute}
                    active={isMuted}
                    pressed={isMuted}
                  >
                    <IconMic off={isMuted} />
                  </IconButton>
                  <IconButton
                    label={isVideoOff ? 'Turn camera on' : 'Turn camera off'}
                    onClick={toggleVideo}
                    active={isVideoOff}
                    pressed={isVideoOff}
                  >
                    <IconVideo off={isVideoOff} />
                  </IconButton>
                  {showMediaControls && (
                    <IconButton
                      label={
                        isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'
                      }
                      onClick={toggleFullscreen}
                      pressed={isFullscreen}
                    >
                      <IconFullscreen active={isFullscreen} />
                    </IconButton>
                  )}
                  {showMediaControls && supportsPip && (
                    <IconButton
                      label={
                        pipActive
                          ? 'Exit picture in picture'
                          : 'Picture in picture'
                      }
                      onClick={togglePip}
                      pressed={pipActive}
                    >
                      <IconPip />
                    </IconButton>
                  )}
                  {canFlipCamera && (
                    <IconButton
                      label="Flip camera"
                      onClick={flipCamera}
                      disabled={isVideoOff}
                    >
                      <IconFlip />
                    </IconButton>
                  )}
                </>
              )}
              <IconButton
                label="Leave call"
                onClick={hangUp}
                variant="hang-up"
                disabled={uiPhase === 'loading'}
              >
                <IconPhoneDown />
              </IconButton>
            </div>
        )}
      </div>

      {uiPhase === 'in-call' && hideControlsBar && (
        <p className="tap-hint" aria-hidden="true">
          Tap screen to show controls
        </p>
      )}

      {copyToast && (
        <div className="toast" role="status">
          Link copied
        </div>
      )}
    </div>
  );
}

export default App;
