const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  } else {
    res.writeHead(404);
    res.end();
  }
});

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
  if (waitingQueue.size < 2) return;

  const queueArray = Array.from(waitingQueue);
  const user1 = queueArray[0];
  const user2 = queueArray[1];

  if (user1.readyState !== WebSocket.OPEN || user2.readyState !== WebSocket.OPEN) {
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
      waitingQueue.add(ws);
      ws.send(JSON.stringify({ type: 'queued' }));
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
