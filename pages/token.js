import { useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';

export default function TokenInput() {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const router = useRouter();

  const handleTokenInput = async (e) => {
    e.preventDefault();
    
    if (!token) {
      setStatus('error');
      setMessage('Please enter a token');
      return;
    }
    
    try {
      setStatus('processing');
      setMessage('Setting token...');
      
      // Send token to API
      const response = await axios.post('/api/auth/token', { token });
      
      setStatus('success');
      setMessage('Token set successfully! Redirecting to home...');
      
      // Redirect to home after a short delay
      setTimeout(() => {
        router.push('/');
      }, 1500);
    } catch (error) {
      setStatus('error');
      setMessage(
        error.response?.data?.error || 
        'Error setting token. Please try again.'
      );
      console.error('Token set error:', error);
    }
  };
  
  return (
    <div className="container">
      <h1>StockX Bearer Token Input</h1>
      
      <form onSubmit={handleTokenInput} className="token-form">
        <div className="form-group">
          <label htmlFor="token">Bearer Token:</label>
          <textarea
            id="token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste your Bearer token here (with or without 'Bearer ' prefix)"
            rows={5}
            className="token-input"
          />
        </div>
        
        <button 
          type="submit" 
          className="submit-button"
          disabled={status === 'processing'}
        >
          {status === 'processing' ? 'Setting...' : 'Set Token'}
        </button>
      </form>
      
      {message && (
        <div className={`status-message ${status}`}>
          {status === 'success' && <span className="success-icon">✓</span>}
          {status === 'error' && <span className="error-icon">✗</span>}
          <p>{message}</p>
        </div>
      )}
      
      <div className="instructions">
        <h2>Instructions</h2>
        <ol>
          <li>Paste your complete Bearer token in the form above</li>
          <li>The token should look like: <code>Bearer eyJhbGciOiJSUzI...</code> or just <code>eyJhbGciOiJSUzI...</code></li>
          <li>Click "Set Token" to store it on the server</li>
          <li>You'll be redirected to the home page where you can use the StockX API</li>
        </ol>
        <p className="note">Note: Directly set tokens won't auto-refresh when they expire. For full persistence, use the standard OAuth flow.</p>
      </div>
      
      <style jsx>{`
        .container {
          max-width: 800px;
          margin: 0 auto;
          padding: 2rem;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
        }
        
        .token-form {
          margin: 2rem 0;
          padding: 1.5rem;
          border-radius: 8px;
          background-color: #f8f9fa;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        
        .form-group {
          margin-bottom: 1.5rem;
        }
        
        label {
          display: block;
          font-weight: bold;
          margin-bottom: 0.5rem;
        }
        
        .token-input {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #ced4da;
          border-radius: 4px;
          font-family: monospace;
          font-size: 0.9rem;
        }
        
        .submit-button {
          background-color: #2196F3;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          font-size: 1rem;
          border-radius: 4px;
          cursor: pointer;
        }
        
        .submit-button:hover {
          background-color: #0b7dda;
        }
        
        .submit-button:disabled {
          background-color: #90caf9;
          cursor: not-allowed;
        }
        
        .status-message {
          margin: 1.5rem 0;
          padding: 1rem;
          border-radius: 4px;
          display: flex;
          align-items: center;
        }
        
        .status-message.success {
          background-color: #e8f5e9;
          color: #2e7d32;
        }
        
        .status-message.error {
          background-color: #ffebee;
          color: #c62828;
        }
        
        .success-icon, .error-icon {
          font-size: 1.5rem;
          margin-right: 0.75rem;
        }
        
        .instructions {
          margin: 2rem 0;
          padding: 1.5rem;
          border-radius: 8px;
          background-color: #e3f2fd;
        }
        
        .instructions h2 {
          margin-top: 0;
        }
        
        .instructions ol {
          margin-left: 1.5rem;
          line-height: 1.6;
        }
        
        .instructions code {
          background-color: #f1f1f1;
          padding: 0.2rem 0.4rem;
          border-radius: 3px;
          font-family: monospace;
          font-size: 0.9rem;
        }
        
        .note {
          margin-top: 1.5rem;
          padding: 0.75rem;
          border-left: 4px solid #ffc107;
          background-color: #fff8e1;
        }
      `}</style>
    </div>
  );
}