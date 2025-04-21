import { useEffect, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/router';

export default function Home() {
  const [tokenStatus, setTokenStatus] = useState('checking');
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Check token status on load
    checkTokenStatus();
  }, []);

  const checkTokenStatus = async () => {
    try {
      // Try to get token from localStorage
      const tokensStr = localStorage.getItem('oauth-tokens');
      
      if (!tokensStr) {
        // No token found, mark as invalid
        setTokenStatus('invalid');
        setIsLoading(false);
        return;
      }

      const tokens = JSON.parse(tokensStr);
      const now = Date.now();
      
      // Check if token is less than 4 hours old
      if (tokens.obtained_at && (now - tokens.obtained_at < 4 * 60 * 60 * 1000)) {
        setTokenStatus('valid');
        // Redirect to search page with valid token
        router.push('/search');
      } else {
        setTokenStatus('invalid');
      }
    } catch (error) {
      console.error('Error checking token:', error);
      setTokenStatus('invalid');
    } finally {
      setIsLoading(false);
    }
  };

  const startOAuthFlow = () => {
    // Generate state parameter for security
    const state = generateRandomState();
    localStorage.setItem('oauth-state', state);
    
    // Build the authorization URL
    const authUrl = `https://accounts.stockx.com/authorize?` +
      `response_type=code&` +
      `client_id=KlbEZjymb9OBap9a3jWlX9bIx4j4y3ks&` +
      `redirect_uri=https://o-auth-ui-2.vercel.app/callback&` +
      `scope=offline_access openid&` +
      `audience=gateway.stockx.com&` +
      `state=${state}`;
    
    // Redirect to StockX for authentication
    window.location.href = authUrl;
  };

  const generateRandomState = () => {
    return Array.from(
      window.crypto.getRandomValues(new Uint8Array(16)),
      byte => byte.toString(16).padStart(2, '0')
    ).join('');
  };

  if (isLoading) {
    return (
      <div className="container">
        <h1>StockX OAuth Portal</h1>
        <div className="loading">Loading...</div>
        <style jsx>{`
          .container {
            text-align: center;
            padding: 2rem;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
          }
          .loading {
            margin-top: 2rem;
            font-size: 1.5rem;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>StockX OAuth Portal</h1>
      
      <div className="status-container">
        {tokenStatus === 'valid' ? (
          <div className="status valid">
            <div className="checkmark">✓</div>
            <p>Token is valid! Redirecting to search...</p>
          </div>
        ) : (
          <div className="status invalid">
            <div className="checkmark">✗</div>
            <p>Token is invalid or expired</p>
            <button className="auth-button" onClick={startOAuthFlow}>
              Authenticate with StockX
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        .container {
          text-align: center;
          padding: 2rem;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
        }
        .status-container {
          margin: 2rem auto;
          max-width: 500px;
          padding: 2rem;
          border-radius: 8px;
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        }
        .status {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .checkmark {
          font-size: 5rem;
          margin-bottom: 1rem;
        }
        .valid .checkmark {
          color: #4CAF50;
        }
        .invalid .checkmark {
          color: #F44336;
        }
        .auth-button {
          background-color: #2196F3;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          font-size: 1rem;
          border-radius: 4px;
          cursor: pointer;
          margin-top: 1rem;
        }
        .auth-button:hover {
          background-color: #0b7dda;
        }
      `}</style>
    </div>
  );
}