# Google OAuth Setup Instructions

## Your Domain
- Frontend (Vercel): https://p-to-p-vchat.vercel.app
- Signaling Server (Render): [Your Render URL - to be added after deployment]

## Step 1: Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the **Google+ API** or **People API**:
   - Go to "APIs & Services" → "Library"
   - Search for "Google+ API" or "People API"
   - Click "Enable"

## Step 2: Create OAuth 2.0 Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth 2.0 Client ID"
3. Configure:
   - **Application type**: Web application
   - **Name**: vchat-auth (or any name you prefer)

4. **Authorized redirect URIs** (add both):
   - Local development: `http://localhost:3000/auth/callback`
   - Production: `https://p-to-p-vchat.vercel.app/auth/callback`

5. **Authorized JavaScript origins** (add both):
   - Local development: `http://localhost:3000`
   - Production: `https://p-to-p-vchat.vercel.app`

6. Click "Create"

## Step 3: Copy Credentials

After creation, you'll see:
- **Client ID**: Copy this (starts with `apps.googleusercontent.com`)
- **Client Secret**: Copy this

## Step 4: Add to Server Environment Variables

Add these to your Render service environment variables:

| Name | Value |
|------|--------|
| `GOOGLE_CLIENT_ID` | Your Client ID from step 3 |
| `GOOGLE_CLIENT_SECRET` | Your Client Secret from step 3 |
| `SESSION_SECRET` | Generate a random string (use: `openssl rand -base64 32`) |
| `JWT_SECRET` | Generate a random string (use: `openssl rand -base64 32`) |
| `JWT_EXPIRATION` | `24h` |
| `ALLOWED_EMAIL_DOMAINS` | `coep.org.in,aissmscoet.com,mitaoe.ac.in,dypcoeakurdi.ac.in,cumminscollege.org,pict.edu,vit.edu,dpcoepune.edu.in,mitwpu.edu.in,siu.edu.in,pcu.edu.in,adypu.edu.in,bvuniversity.edu.in,fergusson.edu,iccs.ac.in,bmcc.ac.in,symbiosiscollege.edu.in` |
| `FRONTEND_URL` | `https://p-to-p-vchat.vercel.app` |

## Step 5: Add to Local Development

Create `server/.env` file with the same values (use `http://localhost:3000` for FRONTEND_URL locally).

## OAuth Flow

1. User clicks "Login with Google" on Vercel frontend
2. Redirects to Google OAuth with callback URL: `https://p-to-p-vchat.vercel.app/auth/callback`
3. Google redirects back to Vercel frontend with authorization code
4. Frontend sends code to Render server: `POST /auth/exchange`
5. Server exchanges code with Google, validates email domain, generates JWT
6. Server returns JWT to frontend
7. Frontend stores JWT in localStorage
8. Frontend uses JWT for WebSocket connections and protected routes

## Testing

After setup:
1. Deploy updated server to Render with new environment variables
2. Test locally: `http://localhost:3000`
3. Test production: `https://p-to-p-vchat.vercel.app`
