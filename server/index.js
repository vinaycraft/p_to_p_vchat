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

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  return rooms.get(roomId);
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

    if (!ws.roomId) return;

    const relayTypes = ['offer', 'answer', 'ice-candidate'];
    if (relayTypes.includes(msg.type)) {
      sendToOthers(ws.roomId, ws, msg);
    }
  });

  ws.on('close', () => removeFromRoom(ws));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Signaling server listening on port ${PORT}`);
});
