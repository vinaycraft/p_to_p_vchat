require('dotenv').config();
const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const session = require('express-session');
const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

const app = express();

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Passport Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback`
},
(accessToken, refreshToken, profile, done) => {
  // Email domain validation will be done in the callback route
  return done(null, profile);
}));

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// OAuth routes
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Exchange authorization code for JWT (called by frontend)
app.post('/auth/exchange', express.json(), async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'Authorization code is required' });
  }

  try {
    // Exchange code for access token and profile
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${process.env.FRONTEND_URL}/auth/callback`,
        grant_type: 'authorization_code'
      })
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      return res.status(400).json({ error: tokenData.error });
    }

    // Get user profile
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });

    const userData = await userResponse.json();

    // Email domain validation
    const email = userData.email;
    const allowedDomains = (process.env.ALLOWED_EMAIL_DOMAINS || '.edu').split(',').map(d => d.trim().toLowerCase());
    const emailDomain = email.split('@')[1].toLowerCase();

    const isAllowed = allowedDomains.some(domain => {
      if (domain.startsWith('.')) {
        // Wildcard domain (e.g., .edu)
        return emailDomain.endsWith(domain);
      }
      // Exact domain match
      return emailDomain === domain;
    });

    if (!isAllowed) {
      return res.status(403).json({
        error: 'Email domain not allowed',
        message: 'Only college email addresses are allowed. Please use your .edu email.'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        picture: userData.picture
      },
      process.env.JWT_SECRET || 'dev-jwt-secret',
      { expiresIn: process.env.JWT_EXPIRATION || '24h' }
    );

    res.json({ token, user: { id: userData.id, email: userData.email, name: userData.name, picture: userData.picture } });
  } catch (err) {
    console.error('[Auth] Error exchanging code:', err);
    res.status(500).json({ error: 'Failed to exchange authorization code' });
  }
});

// Get current user info (protected route)
app.get('/auth/me', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-jwt-secret');
    res.json({ user: decoded });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Create HTTP server
const server = http.createServer(app);

const wss = new WebSocket.Server({ server });

/** @type {Map<string, Set<WebSocket>>} */
const rooms = new Map();

/** @type {Set<WebSocket>} */
const waitingQueue = new Set();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  return rooms.get(roomId);
}

function generateRoomId() {
  return Math.random().toString(36).slice(2, 9);
}

function tryPair() {
  if (waitingQueue.size < 2) {
    console.log('[Queue] Not enough users to pair, queue size:', waitingQueue.size);
    return;
  }

  const queueArray = Array.from(waitingQueue);
  const user1 = queueArray[0];
  const user2 = queueArray[1];

  console.log('[Queue] Attempting to pair, queue size:', waitingQueue.size);

  if (user1.readyState !== WebSocket.OPEN || user2.readyState !== WebSocket.OPEN) {
    console.log('[Queue] Removing closed connections');
    waitingQueue.delete(user1);
    waitingQueue.delete(user2);
    tryPair();
    return;
  }

  const roomId = generateRoomId();
  const room = getRoom(roomId);

  waitingQueue.delete(user1);
  waitingQueue.delete(user2);

  user1.roomId = roomId;
  user2.roomId = roomId;
  room.add(user1);
  room.add(user2);

  console.log('[Queue] Paired users in room:', roomId);
  user1.send(JSON.stringify({ type: 'matched', roomId, role: 'initiator' }));
  user2.send(JSON.stringify({ type: 'matched', roomId, role: 'receiver' }));
}

function removeFromRoom(ws) {
  const roomId = ws.roomId;
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room) return;

  room.delete(ws);
  if (room.size === 0) {
    rooms.delete(roomId);
  } else {
    for (const peer of room) {
      if (peer.readyState === WebSocket.OPEN) {
        peer.send(JSON.stringify({ type: 'peer-left' }));
      }
    }
  }

  tryPair();
}

function sendToOthers(roomId, sender, payload) {
  const room = rooms.get(roomId);
  if (!room) return;

  for (const peer of room) {
    if (peer !== sender && peer.readyState === WebSocket.OPEN) {
      peer.send(JSON.stringify(payload));
    }
  }
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'join') {
      const roomId = msg.roomId;
      if (!roomId || typeof roomId !== 'string') return;

      const room = getRoom(roomId);
      if (room.size >= 2) {
        ws.send(
          JSON.stringify({
            type: 'error',
            message: 'Room is full. Only 2 people per room.',
          })
        );
        return;
      }

      ws.roomId = roomId;
      room.add(ws);

      if (room.size === 1) {
        ws.send(
          JSON.stringify({ type: 'joined', role: 'initiator', waiting: true })
        );
      } else {
        for (const peer of room) {
          if (peer !== ws && peer.readyState === WebSocket.OPEN) {
            peer.send(JSON.stringify({ type: 'peer-joined' }));
          }
        }
        ws.send(JSON.stringify({ type: 'joined', role: 'receiver' }));
      }
      return;
    }

    if (msg.type === 'join-queue') {
      console.log('[Queue] User joined queue, queue size before:', waitingQueue.size);
      waitingQueue.add(ws);
      ws.send(JSON.stringify({ type: 'queued' }));
      console.log('[Queue] User added to queue, queue size after:', waitingQueue.size);
      tryPair();
      return;
    }

    if (msg.type === 'next') {
      const roomId = ws.roomId;
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (!room) return;

      console.log('[Next] User wants next partner in room:', roomId);

      for (const peer of room) {
        if (peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify({ type: 'peer-next' }));
        }
      }

      for (const peer of room) {
        waitingQueue.add(peer);
        peer.roomId = null;
      }

      room.clear();
      rooms.delete(roomId);

      tryPair();
      return;
    }

    if (!ws.roomId) return;

    const relayTypes = ['offer', 'answer', 'ice-candidate'];
    if (relayTypes.includes(msg.type)) {
      sendToOthers(ws.roomId, ws, msg);
    }
  });

  ws.on('close', () => {
    waitingQueue.delete(ws);
    removeFromRoom(ws);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Signaling server listening on port ${PORT}`);
});
