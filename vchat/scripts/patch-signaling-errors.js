const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, '..', 'src', 'VideoChat.js');
let s = fs.readFileSync(p, 'utf8');

const oldError =
  "      'Server not configured. Ask the host to set up signaling, then try again.',";
const newError =
  "      'Signaling server URL is missing. On Vercel, set REACT_APP_WS_URL to wss://YOUR-APP.onrender.com (from Render), save, then redeploy. Or put the same URL in public/signaling.json.',";

if (!s.includes(oldError) && !s.includes(newError)) {
  console.error('resolveSignaling error string not found');
  process.exit(1);
}
s = s.replace(oldError, newError);

s = s.replace(
  "  if (message.includes('Server not configured')) {",
  "  if (message.includes('Signaling server URL is missing') || message.includes('Server not configured')) {"
);

const oldPanel =
  'function ErrorPanel({ phase, message, onAction }) {\n  const { title, message: body, actionLabel } = getPanelContent(phase, message);\n  return (\n    <div className="error-panel" role="alert">\n      <div className="error-card">\n        <h2 className="error-title">{title}</h2>\n        <p className="error-message">{body}</p>';

const newPanel =
  'function ErrorPanel({ phase, message, onAction, roomId }) {\n  const { title, message: body, actionLabel } = getPanelContent(phase, message);\n  return (\n    <div className="error-panel" role="alert">\n      <div className="error-card">\n        <h2 className="error-title">{title}</h2>\n        {roomId && (\n          <p className="error-room">\n            Room <strong>{roomId}</strong> (see <code>?room=</code> in the address bar)\n          </p>\n        )}\n        <p className="error-message">{body}</p>';

if (!s.includes(oldPanel)) {
  if (s.includes('error-room')) {
    console.log('ErrorPanel already patched');
  } else {
    console.error('ErrorPanel block not found');
    process.exit(1);
  }
} else {
  s = s.replace(oldPanel, newPanel);
}

s = s.replace(
  `        <ErrorPanel
          phase={uiPhase}
          message={statusMessage}
          onAction={rejoin}
        />`,
  `        <ErrorPanel
          phase={uiPhase}
          message={statusMessage}
          onAction={rejoin}
          roomId={roomId}
        />`
);

fs.writeFileSync(p, s, 'utf8');
console.log('OK');
