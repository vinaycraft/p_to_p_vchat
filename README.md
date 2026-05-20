# 1:1 Video Chat (vchat)

Minimal peer-to-peer video chat: one React page, one WebSocket signaling server.

## Run locally

**Terminal 1 — signaling server**

```bash
cd server
npm install
npm start
```

**Terminal 2 — React app**

```bash
cd vchat
npm start
```

Open `http://localhost:3000`. Copy the URL (it includes `?room=...`) and open it in a second browser tab or on another device on the same network.

## How it works

- Both users open the **same room** in the URL (`?room=abc123`).
- The server only relays WebRTC signaling (offer, answer, ICE). Video/audio goes **peer-to-peer** when possible.
- Max **2 users** per room.

## Deploy to production

See **[DEPLOY.md](./DEPLOY.md)** for Vercel (frontend) + Render (signaling server).

## Production notes

- Camera/mic require **HTTPS** on the React app (Vercel provides this).
- Set `REACT_APP_WS_URL` to `wss://your-signaling-host` (not `ws://` in production).
- Add a **TURN** server if calls fail on some networks.
