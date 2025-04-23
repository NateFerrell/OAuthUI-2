/**
 * StockX OAuth Hybrid Solution
 * 
 * This script combines:
 * 1. An interactive CLI for initial authentication (similar to OAuth-Flow.js)
 * 2. A persistent server for ongoing token management (similar to persistent-server.js)
 * 
 * This approach allows for easy initial setup via CLI with persistent token management.
 */

const express = require('express');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');
const { exec } = require('child_process');
const cors = require('cors');

// ==== Configuration ====
const config = {
  port: process.env.PORT || 3000,
  tokenFile: process.env.TOKEN_FILE || path.join(__dirname, 'tokens.json'),
  stockxAuth: {
    clientId: process.env.STOCKX_CLIENT_ID || 'KlbEZjymb9OBap9a3jWlX9bIx4j4y3ks',
    clientSecret: process.env.STOCKX_CLIENT_SECRET || 'y2GqspIoDSgzoryXS3Ue--5i0xlXQUU09F4cqnuVgn6Szk4efqZy1qGip_EVqmqe',
    redirectUri: process.env.REDIRECT_URI || 'http://localhost:3000/callback',
    authDomain: 'accounts.stockx.com',
    apiDomain: 'api.stockx.com',
    scope: 'offline_access openid',
    audience: 'gateway.stockx.com',
    apiKey: 'OEgPz70FHNL5AxwwK8fJ92Uyk18knTDOdTBxPmi0'
  },
  refreshBuffer: 15 * 60 * 1000, // Refresh tokens 15 minutes before expiry
};

// Create readline interface for CLI
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Token Storage Class
 * Handles persisting tokens to a local file
 */
class TokenStorage {
  constructor(filePath) {
    this.filePath = filePath;
    this.callbacks = [];
  }

  async get() {
    try {
      const data = await fs.readFile(this.filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      // If file doesn't exist, return empty token object
      return {
        access_token: null,
        refresh_token: null,
        expires_at: null,
        obtained_at: null,
        refresh_count: 0
      };
    }
  }

  async set(tokens) {
    // Ensure the directory exists
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    } catch (err) {
      // Ignore directory exists error
    }

    // Write tokens to file
    await fs.writeFile(this.filePath, JSON.stringify(tokens, null, 2));
    
    // Notify registered callbacks
    this.callbacks.forEach(callback => {
      try {
        callback(tokens);
      } catch (error) {
        console.error('Error in token update callback:', error);
      }
    });
    
    return tokens;
  }
  
  /**
   * Register a callback for token updates
   */
  onTokenUpdate(callback) {
    if (typeof callback === 'function') {
      this.callbacks.push(callback);
    }
    return this;
  }
}

/**
 * StockX OAuth Manager
 * Handles token acquisition, validation, and refresh
 */
class StockXOAuthManager {
  constructor(config) {
    this.config = config;
    this.storage = new TokenStorage(config.tokenFile);
    this.isRefreshing = false;
    this.refreshTimer = null;
    this.initialized = false;
  }

  /**
   * Initialize the OAuth manager
   */
  async init() {
    if (this.initialized) return;

    // Get stored tokens
    const tokens = await this.storage.get();
    
    // Set up refresh timer if we have tokens
    if (tokens.access_token && tokens.refresh_token) {
      this.setupRefreshTimer(tokens);
    }

    this.initialized = true;
    return this;
  }

  /**
   * Set up a timer to refresh the token before it expires
   */
  setupRefreshTimer(tokens) {
    // Clear any existing timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    // If no expiration time, can't set timer
    if (!tokens.expires_at) return;

    // Calculate when to refresh (15 min before expiry)
    const now = Date.now();
    const expiresAt = tokens.expires_at;
    const refreshAt = expiresAt - this.config.refreshBuffer;
    
    // If already past refresh time, refresh immediately
    if (now >= refreshAt) {
      console.log('Token needs immediate refresh');
      setTimeout(() => this.refreshAccessToken(), 0);
      return;
    }

    // Set up timer to refresh before expiry
    const timeout = refreshAt - now;
    console.log(`Setting up refresh timer for ${Math.floor(timeout/1000/60)} minutes from now`);
    
    this.refreshTimer = setTimeout(() => {
      this.refreshAccessToken();
    }, timeout);
  }

  /**
   * Generate authorization URL for OAuth flow
   */
  getAuthorizationUrl() {
    // Generate state parameter for security
    const state = crypto.randomBytes(16).toString('hex');
    
    // Build the authorization URL
    const authUrl = `https://${this.config.stockxAuth.authDomain}/authorize?` +
      `response_type=code&` +
      `client_id=${encodeURIComponent(this.config.stockxAuth.clientId)}&` +
      `redirect_uri=${encodeURIComponent(this.config.stockxAuth.redirectUri)}&` +
      `scope=${encodeURIComponent(this.config.stockxAuth.scope)}&` +
      `audience=${encodeURIComponent(this.config.stockxAuth.audience)}&` +
      `state=${state}`;
    
    return { authUrl, state };
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code) {
    // Build the token request body
    const tokenData = new URLSearchParams();
    tokenData.append('grant_type', 'authorization_code');
    tokenData.append('client_id', this.config.stockxAuth.clientId);
    tokenData.append('client_secret', this.config.stockxAuth.clientSecret);
    tokenData.append('code', code);
    tokenData.append('redirect_uri', this.config.stockxAuth.redirectUri);
    
    // Make the token exchange request
    const response = await axios.post(
      `https://${this.config.stockxAuth.authDomain}/oauth/token`,
      tokenData.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    // Store the tokens with expiration timestamp
    const tokens = await this.storage.get();
    const updatedTokens = {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      id_token: response.data.id_token,
      expires_in: response.data.expires_in,
      token_type: response.data.token_type,
      obtained_at: Date.now(),
      expires_at: Date.now() + (response.data.expires_in * 1000),
      refresh_count: tokens.refresh_count || 0
    };
    
    await this.storage.set(updatedTokens);
    
    // Set up refresh timer
    this.setupRefreshTimer(updatedTokens);
    
    return updatedTokens;
  }

  /**
   * Refresh the access token using refresh token
   */
  async refreshAccessToken() {
    // Prevent multiple concurrent refresh attempts
    if (this.isRefreshing) return;
    
    this.isRefreshing = true;
    
    try {
      // Get stored tokens
      const tokens = await this.storage.get();
      
      // Check if we have a refresh token
      if (!tokens.refresh_token) {
        throw new Error('No refresh token available');
      }
      
      console.log('Refreshing access token...');
      
      // Build the token request body
      const tokenData = new URLSearchParams();
      tokenData.append('grant_type', 'refresh_token');
      tokenData.append('client_id', this.config.stockxAuth.clientId);
      tokenData.append('client_secret', this.config.stockxAuth.clientSecret);
      tokenData.append('refresh_token', tokens.refresh_token);
      
      // Make the token refresh request
      const response = await axios.post(
        `https://${this.config.stockxAuth.authDomain}/oauth/token`,
        tokenData.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      
      // Update stored tokens
      const updatedTokens = {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token || tokens.refresh_token,
        id_token: response.data.id_token || tokens.id_token,
        expires_in: response.data.expires_in,
        token_type: response.data.token_type || 'Bearer',
        obtained_at: Date.now(),
        expires_at: Date.now() + (response.data.expires_in * 1000),
        refresh_count: (tokens.refresh_count || 0) + 1
      };
      
      await this.storage.set(updatedTokens);
      
      console.log('Token refreshed successfully');
      
      // Set up the next refresh
      this.setupRefreshTimer(updatedTokens);
      
      return updatedTokens;
    } catch (error) {
      console.error('Token refresh error:', error.response?.data || error.message);
      throw error;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Get valid access token (refreshing if necessary)
   */
  async getAccessToken() {
    // Initialize if not done already
    if (!this.initialized) {
      await this.init();
    }
    
    // Get current tokens
    const tokens = await this.storage.get();
    
    // If no token or it's expired/about to expire, refresh it
    if (!tokens.access_token || Date.now() + 60000 >= tokens.expires_at) {
      // If we have a refresh token, try to refresh
      if (tokens.refresh_token) {
        try {
          const refreshedTokens = await this.refreshAccessToken();
          return refreshedTokens.access_token;
        } catch (error) {
          throw new Error('Failed to refresh access token');
        }
      } else {
        throw new Error('No tokens available');
      }
    }
    
    return tokens.access_token;
  }

  /**
   * Get the current token status
   */
  async getTokenStatus() {
    const tokens = await this.storage.get();
    
    const now = Date.now();
    const isValid = tokens.access_token && tokens.expires_at && now < tokens.expires_at;
    const expiresIn = tokens.expires_at ? Math.floor((tokens.expires_at - now) / 1000) : null;
    
    return {
      authenticated: !!tokens.access_token,
      valid: isValid,
      expires_in_seconds: expiresIn,
      expires_at: tokens.expires_at ? new Date(tokens.expires_at).toISOString() : null,
      obtained_at: tokens.obtained_at ? new Date(tokens.obtained_at).toISOString() : null,
      refresh_token_available: !!tokens.refresh_token,
      refresh_count: tokens.refresh_count || 0,
      next_refresh_in_seconds: isValid ? Math.floor((tokens.expires_at - this.config.refreshBuffer - now) / 1000) : null
    };
  }

  /**
   * Clear all stored tokens
   */
  async clearTokens() {
    // Clear any refresh timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    
    // Reset tokens in storage
    await this.storage.set({
      access_token: null,
      refresh_token: null,
      expires_at: null,
      obtained_at: null,
      refresh_count: 0
    });
    
    return { success: true };
  }

  /**
   * Make authenticated StockX API request
   */
  async makeApiRequest(method, path, data = null, params = null) {
    // Get a valid access token
    const accessToken = await this.getAccessToken();
    
    // Configure the request
    const config = {
      method: method,
      url: `https://${this.config.stockxAuth.apiDomain}${path}`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'x-api-key': this.config.stockxAuth.apiKey
      }
    };
    
    // Add query parameters if provided
    if (params) {
      config.params = params;
    }
    
    // Add request body if provided
    if (data) {
      config.data = data;
    }
    
    // Make the request
    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error('API request error:', error.response?.data || error.message);
      
      // If unauthorized, try refreshing token and retry once
      if (error.response && error.response.status === 401) {
        try {
          await this.refreshAccessToken();
          
          // Update the authorization header with new token
          const newAccessToken = await this.getAccessToken();
          config.headers.Authorization = `Bearer ${newAccessToken}`;
          
          // Retry the request
          const retryResponse = await axios(config);
          return retryResponse.data;
        } catch (refreshError) {
          console.error('Token refresh and retry failed:', refreshError.message);
          throw error;
        }
      }
      
      throw error;
    }
  }
  
  // Register callback for token updates
  onTokenUpdate(callback) {
    this.storage.onTokenUpdate(callback);
    return this;
  }
}

/**
 * CLI Token Setup
 * Guides user through initial token acquisition via CLI
 */
class CliTokenSetup {
  constructor(oauthManager, readlineInterface) {
    this.oauthManager = oauthManager;
    this.rl = readlineInterface;
  }
  
  /**
   * Prompt user for input
   */
  prompt(question) {
    return new Promise(resolve => {
      this.rl.question(question, answer => {
        resolve(answer);
      });
    });
  }
  
  /**
   * Run the CLI token setup flow
   */
  async run() {
    try {
      console.log('\nStockX OAuth2 CLI Setup');
      console.log('=======================\n');
      
      // Check if we already have tokens
      const status = await this.oauthManager.getTokenStatus();
      
      if (status.authenticated && status.valid) {
        console.log('✅ You already have valid authentication tokens');
        console.log(`They will expire in ${status.expires_in_seconds} seconds`);
        console.log(`Automatic refresh will occur in ${status.next_refresh_in_seconds} seconds`);
        
        const useExisting = await this.prompt('Do you want to use existing tokens? (y/n): ');
        if (useExisting.toLowerCase() === 'y') {
          return await this.oauthManager.getTokenStatus();
        }
      }
      
      // Start authorization flow
      console.log('\nInitiating OAuth authorization flow...');
      const { authUrl, state } = this.oauthManager.getAuthorizationUrl();
      
      console.log('\nAuthorization URL:');
      console.log(authUrl);
      
      // Ask to open browser
      const openBrowser = await this.prompt('\nOpen this URL in your browser? (y/n): ');
      
      if (openBrowser.toLowerCase() === 'y') {
        // Open URL in the default browser
        const command = process.platform === 'win32' 
          ? `start "${authUrl}"` 
          : process.platform === 'darwin' 
            ? `open "${authUrl}"` 
            : `xdg-open "${authUrl}"`;
        
        exec(command, (error) => {
          if (error) {
            console.log(`\nCouldn't open browser automatically. Please copy and paste the URL manually.`);
          }
        });
      }
      
      console.log('\n=================================================================');
      console.log('                    OAUTH AUTHENTICATION FLOW                    ');
      console.log('=================================================================');
      console.log('1. Login to StockX in the browser window');
      console.log('2. After logging in, you will be redirected to the callback URL');
      console.log('3. The URL may show an error page, but that\'s OK');
      console.log('4. Copy the FULL URL from your browser address bar after redirection');
      console.log('=================================================================');
      
      const callbackUrl = await this.prompt('\nPaste the full callback URL from your browser: ');
      
      // Extract authorization code from URL
      let code;
      if (callbackUrl.includes('?')) {
        const urlParams = new URLSearchParams(callbackUrl.split('?')[1]);
        const urlState = urlParams.get('state');
        code = urlParams.get('code');
        
        // Verify state parameter
        if (urlState && urlState !== state) {
          console.warn(`\n⚠️ State mismatch warning! Expected: ${state}, Received: ${urlState}`);
          const continueAnyway = await this.prompt('Continue anyway? (y/n): ');
          if (continueAnyway.toLowerCase() !== 'y') {
            throw new Error('Authentication canceled due to state mismatch');
          }
        }
      }
      
      if (!code) {
        code = await this.prompt('\nCould not extract code from URL. Please paste just the code: ');
      }
      
      // Exchange code for tokens
      console.log('\nExchanging authorization code for tokens...');
      const tokens = await this.oauthManager.exchangeCodeForTokens(code);
      
      console.log('\n✅ Authentication successful!');
      console.log(`Access token: ${tokens.access_token.substring(0, 15)}...`);
      console.log(`Token expires in: ${Math.floor((tokens.expires_at - Date.now()) / 1000)} seconds`);
      console.log(`Refresh token: ${tokens.refresh_token.substring(0, 15)}...`);
      
      return await this.oauthManager.getTokenStatus();
    } catch (error) {
      console.error('\n❌ Authentication error:', error.message);
      throw error;
    }
  }
  
  /**
   * Close the readline interface
   */
  close() {
    this.rl.close();
  }
}

// Create Express app for web server
const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Create OAuth Manager
const oauthManager = new StockXOAuthManager(config);

// Auth status endpoint
app.get('/api/auth/status', async (req, res) => {
  try {
    const status = await oauthManager.getTokenStatus();
    res.json(status);
  } catch (error) {
    console.error('Error getting status:', error);
    res.status(500).json({ error: 'Failed to get auth status' });
  }
});

// Auth initialization endpoint
app.get('/api/auth/init', (req, res) => {
  try {
    const { authUrl, state } = oauthManager.getAuthorizationUrl();
    res.json({ authUrl, state });
  } catch (error) {
    console.error('Error initializing auth:', error);
    res.status(500).json({ error: 'Failed to initialize auth' });
  }
});

// Auth callback endpoint
app.post('/api/auth/callback', async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Missing authorization code' });
    }
    
    await oauthManager.exchangeCodeForTokens(code);
    res.json({ success: true });
  } catch (error) {
    console.error('Error in auth callback:', error);
    res.status(500).json({ error: 'Failed to exchange code for tokens' });
  }
});

// Auth clear endpoint
app.post('/api/auth/clear', async (req, res) => {
  try {
    await oauthManager.clearTokens();
    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing auth:', error);
    res.status(500).json({ error: 'Failed to clear auth tokens' });
  }
});

// API proxy endpoint for StockX API
app.all('/api/stockx/*', async (req, res) => {
  try {
    // Extract StockX API path
    const stockxPath = req.path.replace(/^\/api\/stockx\//, '/');
    
    // Prepare for API request
    const method = req.method;
    const data = ['POST', 'PUT', 'PATCH'].includes(method) ? req.body : null;
    
    // Make the authenticated API request
    const result = await oauthManager.makeApiRequest(method, stockxPath, data, req.query);
    
    // Return the API response
    res.json(result);
  } catch (error) {
    console.error('API proxy error:', error);
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

// Main entry point
async function main() {
  try {
    // Initialize OAuth manager
    await oauthManager.init();
    
    // Get token status
    const status = await oauthManager.getTokenStatus();
    
    // If we don't have tokens, run CLI flow
    if (!status.authenticated || !status.valid) {
      console.log('No valid tokens found. Starting CLI setup...');
      
      const cliSetup = new CliTokenSetup(oauthManager, rl);
      await cliSetup.run();
      cliSetup.close();
    }
    
    // Start web server
    app.listen(config.port, () => {
      console.log(`\n✅ StockX OAuth server running on port ${config.port}`);
      console.log(`Open http://localhost:${config.port} to access the web interface`);
      console.log(`API endpoints available at http://localhost:${config.port}/api/*`);
      
      // Display token status
      oauthManager.getTokenStatus().then(status => {
        console.log('\nToken Status:');
        console.log(`- Authentication Valid: ${status.valid}`);
        console.log(`- Expires In: ${formatTime(status.expires_in_seconds)}`);
        console.log(`- Refresh Count: ${status.refresh_count}`);
        console.log(`- Next Auto-Refresh: ${formatTime(status.next_refresh_in_seconds)}`);
      });
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Helper function to format time in a human-readable format
function formatTime(seconds) {
  if (!seconds || seconds < 0) return 'Unknown';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  let result = '';
  if (hours > 0) result += `${hours}h `;
  if (minutes > 0 || hours > 0) result += `${minutes}m `;
  result += `${secs}s`;
  
  return result;
}

// Start the application
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}