import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';

export default function Callback() {
  const [status, setStatus] = useState('processing');
  const [message, setMessage] = useState('Processing authentication...');
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;

    const { code, state, error, error_description } = router.query;

    if (error) {
      setStatus('error');
      setMessage(`Authentication error: ${error}. ${error_description || ''}`);
      return;
    }

    if (!code) {
      setStatus('error');
      setMessage('No authentication code received.');
      return;
    }

    if (!state) {
      setStatus('error');
      setMessage('No state parameter received.');
      return;
    }

    // Exchange code for tokens on the server
    exchangeCodeForTokens(code, state);
  }, [router.isReady, router.query]);

  const exchangeCodeForTokens = async (code, state) => {
    try {
      setStatus('exchanging');
      setMessage('Exchanging authorization code for tokens...');

      // Call the server-side API route to handle token exchange
      await axios.post('/api/auth/callback', {
        code,
        state
      });

      setStatus('success');
      setMessage('Authentication successful!');
      
      // Redirect to home page after a short delay
      setTimeout(() => {
        router.push('/');
      }, 1500);
    } catch (error) {
      setStatus('error');
      setMessage(
        error.response?.data?.error || 
        'Error exchanging code for tokens. Please try again.'
      );
      console.error('Token exchange error:', error);
    }
  };

  return (
    <div className="container">
      <h1>StockX Authentication</h1>
      
      <div className={`status-container ${status}`}>
        {status === 'processing' && <div className="spinner"></div>}
        {status === 'exchanging' && <div className="spinner"></div>}
        {status === 'success' && <div className="checkmark">✓</div>}
        {status === 'error' && <div className="error-mark">✗</div>}
        
        <p>{message}</p>
        
        {status === 'error' && (
          <button 
            className="retry-button"
            onClick={() => window.location.href = '/'}
          >
            Return to Home
          </button>
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
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .status-container.success {
          border-left: 5px solid #4CAF50;
        }
        .status-container.error {
          border-left: 5px solid #F44336;
        }
        .spinner {
          border: 4px solid rgba(0, 0, 0, 0.1);
          border-radius: 50%;
          border-top: 4px solid #2196F3;
          width: 50px;
          height: 50px;
          animation: spin 1s linear infinite;
          margin-bottom: 1rem;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .checkmark {
          font-size: 5rem;
          color: #4CAF50;
          margin-bottom: 1rem;
        }
        .error-mark {
          font-size: 5rem;
          color: #F44336;
          margin-bottom: 1rem;
        }
        .retry-button {
          background-color: #2196F3;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          font-size: 1rem;
          border-radius: 4px;
          cursor: pointer;
          margin-top: 1rem;
        }
        .retry-button:hover {
          background-color: #0b7dda;
        }
      `}</style>
    </div>
  );
}