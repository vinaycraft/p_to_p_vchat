import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import './Landing.css';

function Landing() {
  useEffect(() => {
    document.title = 'Video Chat — Talk to someone new';
  }, []);

  return (
    <div className="landing">
      <header className="landing-header">
        <span className="landing-logo" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="8" fill="currentColor" />
            <path
              d="M22 14l4.5-2.25A1 1 0 0128 12.7v6.6a1 1 0 01-1.5.9L22 18M8 22h8a2 2 0 002-2v-8a2 2 0 00-2-2H8a2 2 0 00-2 2v8a2 2 0 002 2z"
              stroke="#fff"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="landing-brand">Video Chat</span>
      </header>

      <main className="landing-main">
        <h1 className="landing-title">Meet someone new on video</h1>
        <p className="landing-lead">
          One-to-one video conversations for college students. Sign in with your
          college email to get started.
        </p>

        <Link to="/login" className="landing-cta">
          Start video chat
        </Link>

        <p className="landing-note">
          You will be asked to sign in with your college email address.
        </p>
        <p className="landing-note landing-note-dev">
          Local dev: run <code>cd server && npm start</code> in another terminal
          before starting a call.
        </p>

        <div className="landing-divider" role="presentation">
          <span>or</span>
        </div>

        <p className="landing-private">
          Have a private room link?{' '}
          <Link to="/login" className="landing-link">
            Sign in
          </Link>{' '}
          first, then share the URL with your partner (includes <code>?room=</code> in
          the address bar).
        </p>
      </main>

      <footer className="landing-footer">
        <p>Be respectful. You must be 18+ to use this service.</p>
      </footer>
    </div>
  );
}

export default Landing;
