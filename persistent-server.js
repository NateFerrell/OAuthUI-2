/**
 * StockX OAuth Persistent Server
 * 
 * This server maintains persistent authentication with StockX using refresh tokens.
 * It provides:
 * 1. Complete OAuth flow for initial setup
 * 2. Automatic token refresh
 * 3. API proxy with authentication
 */

const express = require('express');
const cors = require('cors');
const oauthManager = require('./refresh-manager');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');

// Create Express app
const app = express();
app.use(express.json());
app.use(cors());

// Store state parameters for verification
const stateLookup = new Map();

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Authentication status
app.get('/api/auth/status', async (req, res) => {
  try {
    const status = await oauthManager.getTokenStatus();
    res.json(status);
  } catch (error) {
    console.error('Error getting auth status:', error);
    res.status(500).json({ error: 'Failed to get authentication status' });
  }
});

// Start OAuth flow
app.get('/api/auth/init', (req, res) => {
  try {
    // Generate authorization URL with state parameter
    const { authUrl, state } = oauthManager.getAuthorizationUrl();
    
    // Store state for verification
    stateLookup.set(state, { created: Date.now() });
    
    // Clean up expired states (older than 30 minutes)
    const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
    for (const [s, data] of stateLookup.entries()) {
      if (data.created < thirtyMinutesAgo) {
        stateLookup.delete(s);
      }
    }
    
    res.json({ authUrl });
  } catch (error) {
    console.error('Error initializing auth:', error);
    res.status(500).json({ error: 'Failed to initialize authentication' });
  }
});

// OAuth callback handler
app.get('/callback', (req, res) => {
  // This endpoint is only to show a success page to the user
  // The actual code exchange happens via the API endpoint below
  res.sendFile(path.join(__dirname, 'public', 'callback.html'));
});

// Exchange code for tokens
app.post('/api/auth/callback', async (req, res) => {
  try {
    const { code, state } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }
    
    if (!state) {
      return res.status(400).json({ error: 'State parameter is required' });
    }
    
    // Verify state parameter
    if (!stateLookup.has(state)) {
      return res.status(400).json({ error: 'Invalid state parameter' });
    }
    
    // Remove state from lookup
    stateLookup.delete(state);
    
    // Exchange code for tokens
    const tokens = await oauthManager.exchangeCodeForTokens(code);
    
    res.json({ success: true });
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({ error: 'Failed to exchange authorization code for tokens' });
  }
});

// API proxy with automatic authentication
app.all('/api/stockx/*', async (req, res) => {
  try {
    // Get the StockX API path from the request URL
    const stockxPath = req.path.replace(/^\/api\/stockx\//, '');
    
    // Get a valid access token
    const accessToken = await oauthManager.getAccessToken();
    
    // Forward the request to StockX API
    const apiReq = {
      method: req.method,
      url: `https://api.stockx.com/${stockxPath}`,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-api-key': oauthManager.config.clientId,
        'Content-Type': 'application/json'
      },
      params: req.query,
      data: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined
    };
    
    const response = await axios(apiReq);
    
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('API proxy error:', error.response?.data || error.message);
    
    // If we got a 401 unauthorized, the token might be invalid despite our automatic refresh
    if (error.response?.status === 401) {
      res.status(401).json({
        error: 'Unauthorized access to API',
        message: 'Your authentication has expired. Please re-authenticate.'
      });
    } else {
      // Forward the original error
      res.status(error.response?.status || 500).json(
        error.response?.data || { error: 'Failed to call API' }
      );
    }
  }
});

// Initialize the OAuth manager and start the server
async function startServer() {
  try {
    await oauthManager.init();
    
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`OAuth callback URL: http://localhost:${PORT}/callback`);
      
      // Print current token status
      oauthManager.getTokenStatus().then(status => {
        console.log('Current token status:', status);
      });
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Register token update handler
oauthManager.onTokenUpdate(tokens => {
  if (tokens) {
    console.log(`Token updated. Expires in ${Math.floor((tokens.expires_at - Date.now()) / 1000)} seconds`);
  } else {
    console.log('Tokens cleared');
  }
});

// Start the server
startServer();