/**
 * Token Manager Service
 * 
 * Manages StockX OAuth tokens on the server side, including:
 * - Token storage
 * - Token validation
 * - Token refresh
 * - Background refresh process
 */

const axios = require('axios');

// Token storage - adapts based on environment
// Uses in-memory for development and Node.js environment
// Supports Cloudflare KV integration when available
const tokenStorage = {
  // In-memory storage for development
  memoryStore: {
    access_token: null,
    refresh_token: null,
    expires_at: null,
    obtained_at: null
  },
  
  // Get token from the appropriate storage
  async get() {
    // Check if running in Cloudflare environment with KV
    if (typeof caches !== 'undefined' && process.env.CF_PAGES) {
      try {
        // This would be the Cloudflare KV binding in a real deployment
        const KV = globalThis.TOKEN_STORE;
        if (KV) {
          const tokens = await KV.get('oauth-tokens', { type: 'json' });
          if (tokens) return tokens;
        }
      } catch (error) {
        console.warn('Error accessing Cloudflare KV, falling back to memory storage:', error);
      }
    }
    
    // Fallback to memory storage
    return this.memoryStore;
  },
  
  // Save token to the appropriate storage
  async set(tokens) {
    // Check if running in Cloudflare environment with KV
    if (typeof caches !== 'undefined' && process.env.CF_PAGES) {
      try {
        // This would be the Cloudflare KV binding in a real deployment
        const KV = globalThis.TOKEN_STORE;
        if (KV) {
          await KV.put('oauth-tokens', JSON.stringify(tokens));
        }
      } catch (error) {
        console.warn('Error writing to Cloudflare KV, falling back to memory storage:', error);
      }
    }
    
    // Always update memory storage as well
    this.memoryStore = tokens;
    return tokens;
  }
};

// StockX OAuth credentials
// In production, these should be environment variables
const STOCKX_CREDENTIALS = {
  client_id: process.env.STOCKX_CLIENT_ID || 'KlbEZjymb9OBap9a3jWlX9bIx4j4y3ks',
  client_secret: process.env.STOCKX_CLIENT_SECRET || 'y2GqspIoDSgzoryXS3Ue--5i0xlXQUU09F4cqnuVgn6Szk4efqZy1qGip_EVqmqe',
  redirect_uri: process.env.REDIRECT_URI || 'https://stockx-consignment-portal.pages.dev/callback'
};

/**
 * Initialize the OAuth flow
 * @returns {string} The authorization URL to redirect the user to
 */
function getAuthorizationUrl() {
  // Generate a random state parameter for security
  const state = generateRandomState();
  
  // Build the authorization URL
  const authUrl = `https://accounts.stockx.com/authorize?` +
    `response_type=code&` +
    `client_id=${STOCKX_CREDENTIALS.client_id}&` +
    `redirect_uri=${STOCKX_CREDENTIALS.redirect_uri}&` +
    `scope=offline_access openid&` +
    `audience=gateway.stockx.com&` +
    `state=${state}`;
  
  return { authUrl, state };
}

/**
 * Exchange an authorization code for access and refresh tokens
 * @param {string} code - The authorization code from the OAuth callback
 * @returns {Promise<Object>} The tokens
 */
async function exchangeCodeForTokens(code) {
  try {
    // Build the token request body
    const tokenData = new URLSearchParams();
    tokenData.append('grant_type', 'authorization_code');
    tokenData.append('client_id', STOCKX_CREDENTIALS.client_id);
    tokenData.append('client_secret', STOCKX_CREDENTIALS.client_secret);
    tokenData.append('code', code);
    tokenData.append('redirect_uri', STOCKX_CREDENTIALS.redirect_uri);

    // Make the token exchange request
    const response = await axios.post(
      'https://accounts.stockx.com/oauth/token',
      tokenData.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    // Store the tokens
    const tokens = {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      expires_in: response.data.expires_in,
      obtained_at: Date.now(),
      expires_at: Date.now() + (response.data.expires_in * 1000)
    };
    
    await tokenStorage.set(tokens);

    console.log('Tokens obtained successfully');
    return tokens;
  } catch (error) {
    console.error('Token exchange error:', error.response?.data || error.message);
    throw new Error('Failed to exchange authorization code for tokens');
  }
}

/**
 * Refresh the access token using the refresh token
 * @returns {Promise<Object>} The new tokens
 */
async function refreshToken() {
  try {
    // Get the current tokens
    const tokens = await tokenStorage.get();
    
    // Check if we have a refresh token
    if (!tokens.refresh_token) {
      throw new Error('No refresh token available');
    }

    // Build the token request body
    const tokenData = new URLSearchParams();
    tokenData.append('grant_type', 'refresh_token');
    tokenData.append('client_id', STOCKX_CREDENTIALS.client_id);
    tokenData.append('client_secret', STOCKX_CREDENTIALS.client_secret);
    tokenData.append('refresh_token', tokens.refresh_token);

    // Make the token refresh request
    const response = await axios.post(
      'https://accounts.stockx.com/oauth/token',
      tokenData.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    // Update the token store
    const updatedTokens = {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token || tokens.refresh_token,
      expires_in: response.data.expires_in,
      obtained_at: Date.now(),
      expires_at: Date.now() + (response.data.expires_in * 1000)
    };
    
    await tokenStorage.set(updatedTokens);

    console.log('Tokens refreshed successfully');
    return updatedTokens;
  } catch (error) {
    console.error('Token refresh error:', error.response?.data || error.message);
    // Clear the token store on refresh failure
    await tokenStorage.set({
      access_token: null,
      refresh_token: null,
      expires_at: null,
      obtained_at: null
    });
    throw new Error('Failed to refresh tokens');
  }
}

/**
 * Get the current access token, refreshing if necessary
 * @returns {Promise<string>} The access token
 */
async function getAccessToken() {
  const tokens = await tokenStorage.get();
  
  // If we don't have a token or it's expired, try to refresh
  if (!tokens.access_token || Date.now() >= tokens.expires_at) {
    // If we have a refresh token, try to refresh
    if (tokens.refresh_token) {
      try {
        const refreshedTokens = await refreshToken();
        return refreshedTokens.access_token;
      } catch (error) {
        throw new Error('Failed to get access token');
      }
    } else {
      throw new Error('No tokens available');
    }
  }

  return tokens.access_token;
}

/**
 * Check if we have a valid access token
 * @returns {Promise<boolean>} Whether we have a valid token
 */
async function hasValidToken() {
  const tokens = await tokenStorage.get();
  
  return (
    tokens.access_token && 
    tokens.expires_at && 
    Date.now() < tokens.expires_at
  );
}

/**
 * Get the token status
 * @returns {Promise<Object>} The token status
 */
async function getTokenStatus() {
  const tokens = await tokenStorage.get();
  const isValid = await hasValidToken();
  
  return {
    has_token: !!tokens.access_token,
    is_valid: isValid,
    expires_in: tokens.expires_at ? Math.floor((tokens.expires_at - Date.now()) / 1000) : null,
    obtained_at: tokens.obtained_at
  };
}

/**
 * Initialize background token refresh
 * Checks every 10 minutes if the token needs refreshing
 */
function initBackgroundRefresh() {
  // Check every 10 minutes
  const REFRESH_INTERVAL = 10 * 60 * 1000;
  
  // Set up the interval
  setInterval(async () => {
    try {
      const tokens = await tokenStorage.get();
      
      // If we have a token and it expires within the next 20 minutes, refresh it
      if (
        tokens.access_token &&
        tokens.expires_at &&
        Date.now() + 20 * 60 * 1000 >= tokens.expires_at
      ) {
        console.log('Background refresh: Token is about to expire, refreshing...');
        await refreshToken();
        console.log('Background refresh: Token refreshed successfully');
      }
    } catch (error) {
      console.error('Background refresh error:', error.message);
    }
  }, REFRESH_INTERVAL);

  console.log('Background token refresh initialized');
}

/**
 * Generate a random state parameter for security
 * @returns {string} A random hex string
 */
function generateRandomState() {
  // In a browser environment we would use window.crypto
  // Here we use Node.js crypto
  const crypto = require('crypto');
  return crypto.randomBytes(16).toString('hex');
}

// Export the functions
module.exports = {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  refreshToken,
  getAccessToken,
  hasValidToken,
  getTokenStatus,
  initBackgroundRefresh
};