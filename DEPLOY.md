# Deploy vchat (Vercel + signaling server)

Vercel hosts the **React app**. The **WebSocket signaling server** must run elsewhere (Vercel serverless does not support persistent WebSockets). We use **Render** (free) for signaling.

## Step 1 — Deploy signaling server (Render)

1. Push this repo to **GitHub** (if not already).
2. Go to [render.com](https://render.com) → **New** → **Blueprint** (or **Web Service**).
3. Connect your repo and set:
   - **Root directory:** `server`
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Health check path:** `/health`
4. After deploy, copy your service URL, e.g. `https://vchat-signaling.onrender.com`.
5. Your WebSocket URL is the same host with `wss://`:
   - `wss://vchat-signaling.onrender.com`

> Free Render services sleep after inactivity; the first connection may take ~30s to wake up.

## Step 2 — Deploy React app (Vercel)

1. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your GitHub repo.
2. **Root Directory:** `vchat` (click Edit → set to `vchat`).
3. Framework should auto-detect **Create React App**.
4. **Environment variables** (Production, Preview, Development):

   | Name | Value |
   |------|--------|
   | `REACT_APP_WS_URL` | `wss://YOUR-RENDER-APP.onrender.com` |

   Use your real Render hostname from Step 1. No trailing slash.

5. Click **Deploy**.

## Step 3 — Test production

1. Open your Vercel URL, e.g. `https://vchat.vercel.app`.
2. Allow camera/microphone.
3. Copy the full URL (includes `?room=...`).
4. Open the **same URL** in another browser or device.

If you see “Cannot reach signaling server”, check `REACT_APP_WS_URL` on Vercel and that the Render service is running.

## Optional — CLI deploy (Vercel)

```bash
cd vchat
npm i -g vercel
vercel
```

Set `REACT_APP_WS_URL` when prompted, or in the Vercel dashboard after the first deploy.

## Local vs production

| | Local | Production |
|--|--------|------------|
| React | `http://localhost:3000` | `https://*.vercel.app` |
| Signaling | `ws://localhost:8080` | `wss://*.onrender.com` |
| Env | `vchat/.env` | Vercel env vars |
