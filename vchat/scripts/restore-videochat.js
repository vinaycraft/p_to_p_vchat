const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');
const outPath = path.join(__dirname, '..', 'src', 'VideoChat.js');

let s = execSync('git show 3b595de:vchat/src/App.js', {
  cwd: repoRoot,
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024,
});

if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);

s = s.replace(/^function App\(/m, 'function VideoChat(');
s = s.replace(/export default App;/, 'export default VideoChat;');

if (!s.includes('useNavigate')) {
  s = s.replace(
    "import { useCallback, useEffect, useRef, useState } from 'react';",
    "import { useCallback, useEffect, useRef, useState } from 'react';\nimport { useNavigate } from 'react-router-dom';"
  );
  s = s.replace(
    'function VideoChat() {\n  const localVideoRef',
    'function VideoChat() {\n  const navigate = useNavigate();\n  const localVideoRef'
  );
  s = s.replace(
    '  const copyRoomLink = useCallback(async () => {',
    `  const goHome = useCallback(() => {
    leaveIntentionalRef.current = true;
    cleanupSessionRef.current();
    navigate('/');
  }, [navigate]);

  const copyRoomLink = useCallback(async () => {`
  );
  s = s.replace(
    '    setViewsSwapped(false);\n    setUiPhase(\'ended\');',
    '    setViewsSwapped(false);\n    resetJoinNotification();\n    setUiPhase(\'ended\');'
  );
  if (!s.includes('back-home')) {
    s = s.replace(
      '      {showRoomHeader && (',
      `      <button
        type="button"
        className={\`back-home \${hideControlsBar ? 'ui-faded' : ''}\`}
        onClick={goHome}
        aria-label="Back to home"
      >
        Home
      </button>

      {showRoomHeader && (`
    );
  }
  if (!s.includes('}, [clearRemoteVideo, resetJoinNotification]);')) {
    s = s.replace(
      '  }, [clearRemoteVideo]);\n\n  const toggleMute',
      '  }, [clearRemoteVideo, resetJoinNotification]);\n\n  const toggleMute'
    );
  }
}

fs.writeFileSync(outPath, s, { encoding: 'utf8' });
console.log('OK', s.startsWith('import'), s.includes('export default VideoChat'));
