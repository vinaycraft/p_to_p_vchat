const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, '..', 'src', 'VideoChat.js');
let s = fs.readFileSync(p, 'utf8');

const oldResolve = `async function resolveSignalingWsUrl() {
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
      'Signaling server URL is missing. On Vercel, set REACT_APP_WS_URL to wss://YOUR-APP.onrender.com (from Render), save, then redeploy. Or put the same URL in public/signaling.json.',
  };
}`;

const newResolve = `function localDevWsUrl(pageIsHttps) {
  if (pageIsHttps) return null;
  const host = window.location.hostname || 'localhost';
  const port = process.env.REACT_APP_WS_PORT || '8080';
  return \`ws://\${host}:\${port}\`;
}

/** Use LAN hostname when the page is opened via 192.168.x.x but .env still says localhost. */
function adjustEnvWsForLocalPage(url) {
  if (!url || typeof window === 'undefined') return url;
  const host = window.location.hostname;
  if (!host || host === 'localhost' || host === '127.0.0.1') return url;
  return url
    .replace(/^wss?:\\/\\/localhost\\b/i, \`ws://\${host}\`)
    .replace(/^wss?:\\/\\/127\\.0\\.0\\.1\\b/i, \`ws://\${host}\`);
}

async function resolveSignalingWsUrl() {
  const pageIsHttps = window.location.protocol === 'https:';

  let fromEnv = normalizeWsUrl(
    process.env.REACT_APP_WS_URL || '',
    pageIsHttps
  );
  fromEnv = adjustEnvWsForLocalPage(fromEnv);
  if (fromEnv) return { url: fromEnv, error: null };

  try {
    const res = await fetch('/signaling.json', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      let fromFile = normalizeWsUrl(data.wsUrl || '', pageIsHttps);
      fromFile = adjustEnvWsForLocalPage(fromFile);
      if (fromFile) return { url: fromFile, error: null };
    }
  } catch {
    /* fallback below */
  }

  const local = localDevWsUrl(pageIsHttps);
  if (local) return { url: local, error: null };

  return {
    url: null,
    error:
      'Signaling server URL is missing. On Vercel, set REACT_APP_WS_URL to wss://YOUR-APP.onrender.com (from Render), save, then redeploy. Or put the same URL in public/signaling.json.',
  };
}`;

if (!s.includes(oldResolve)) {
  if (s.includes('localDevWsUrl')) {
    console.log('already patched');
    process.exit(0);
  }
  console.error('resolveSignalingWsUrl block not found');
  process.exit(1);
}

s = s.replace(oldResolve, newResolve);

s = s.replace(
  "setStatusMessage('Could not reach server. Tap Try again.');",
  "setStatusMessage(\n            'Could not reach signaling server. In a second terminal run: cd server && npm start (port 8080). Then tap Try again.'\n          );"
);

fs.writeFileSync(p, s, 'utf8');
console.log('OK');
