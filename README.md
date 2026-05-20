# 1:1 Video Chat (vchat)

Minimal peer-to-peer video chat: one React page, one WebSocket signaling server.

## Run locally

You need **two terminals** — the React app alone is not enough.

**Terminal 1 — signaling server (required)**

```bash
cd server
npm install
npm start
```

You should see: `Signaling server listening on port 8080`.  
Check: open `http://localhost:8080/health` → should show `ok`.

**Terminal 2 — React app**

```bash
cd vchat
npm install
npm start
```

**Phase A flow**

1. Open **`http://localhost:3000`** (landing page).
2. Click **Start video chat** → goes to `/chat`.
3. The address bar updates to **`/chat?room=xxxxxxx`** (room is created automatically).
4. Allow camera/microphone.
5. Copy the full URL and open it in a **second tab** (or another browser) to join the same room.

If you see **Try again** / **Could not reach server**, Terminal 1 is probably not running.

**Phone / another PC on Wi‑Fi:** use your PC’s LAN URL from the CRA banner (e.g. `http://192.168.0.x:3000`). The app will use `ws://192.168.0.x:8080` for signaling (not `localhost`). Both devices must reach port **8080** on your PC (Windows firewall may need to allow Node).

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
