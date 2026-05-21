import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './App.css';

function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleOAuthCallback = useCallback(async (code) => {
    setLoading(true);
    setError(null);

    try {
      const wsUrl = process.env.REACT_APP_WS_URL || 'http://localhost:8080';
      const response = await fetch(`${wsUrl}/auth/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Authentication failed');
      }

      // Store token and user info
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('user_info', JSON.stringify(data.user));

      // Redirect to chat
      navigate('/chat');
    } catch (err) {
      console.error('[Login] OAuth callback error:', err);
      setError(err.message || 'Authentication failed. Please try again.');
      // Clear the code from URL
      window.history.replaceState({}, document.title, '/login');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    // Check if user is already logged in
    const token = localStorage.getItem('auth_token');
    if (token) {
      navigate('/chat');
      return;
    }

    // Handle OAuth callback
    const code = searchParams.get('code');
    if (code) {
      handleOAuthCallback(code);
    }
  }, [searchParams, navigate, handleOAuthCallback]);

  const handleGoogleLogin = () => {
    const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
    const redirectUri = window.location.origin + '/auth/callback';
    const scope = 'email profile';

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scope)}`;

    window.location.href = authUrl;
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-card">
          <h1 className="login-title">College Video Chat</h1>
          <p className="login-subtitle">
            Connect with fellow students via video chat
          </p>
          <p className="login-requirement">
            Only college email addresses allowed (SRTTC, COEP, MIT, VIT, Symbiosis, etc.)
          </p>

          {error && (
            <div className="login-error">
              {error}
            </div>
          )}

          {loading ? (
            <div className="login-loading">
              <div className="spinner" aria-hidden="true" />
              <p>Signing in...</p>
            </div>
          ) : (
            <button
              className="btn btn-primary google-login-btn"
              onClick={handleGoogleLogin}
              disabled={loading}
            >
              <svg
                viewBox="0 0 24 24"
                width="24"
                height="24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
                  <path
                    fill="#4285F4"
                    d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"
                  />
                  <path
                    fill="#34A853"
                    d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"
                  />
                </g>
              </svg>
              Sign in with Google
            </button>
          )}

          <p className="login-note">
            By signing in, you agree to use your college email for verification only.
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
