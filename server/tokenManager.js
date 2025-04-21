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

// In a production environment, this would be stored in a database
// For development purposes, we're using in-memory storage
let tokenStore = {
  access_token: null,
  refresh_token: null,
  expires_at: null,
  obtained_at: null
};

// StockX OAuth credentials
// In production, these should be environment variables
const STOCKX_CREDENTIALS = {
  client_id: 'KlbEZjymb9OBap9a3jWlX9bIx4j4y3ks',
  client_secret: 'y2GqspIoDSgzoryXS3Ue--5i0xlXQUU09F4cqnuVgn6Szk4efqZy1qGip_EVqmqe',
  redirect_uri: 'https://o-auth-ui-2.vercel.app/callback'
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
 * @param {string} state - The state parameter from the OAuth callback 
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
    tokenStore = {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      expires_in: response.data.expires_in,
      obtained_at: Date.now(),
      expires_at: Date.now() + (response.data.expires_in * 1000)
    };

    console.log('Tokens obtained successfully');
    return tokenStore;
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
    // Check if we have a refresh token
    if (!tokenStore.refresh_token) {
      throw new Error('No refresh token available');
    }

    // Build the token request body
    const tokenData = new URLSearchParams();
    tokenData.append('grant_type', 'refresh_token');
    tokenData.append('client_id', STOCKX_CREDENTIALS.client_id);
    tokenData.append('client_secret', STOCKX_CREDENTIALS.client_secret);
    tokenData.append('refresh_token', tokenStore.refresh_token);

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
    tokenStore = {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token || tokenStore.refresh_token,
      expires_in: response.data.expires_in,
      obtained_at: Date.now(),
      expires_at: Date.now() + (response.data.expires_in * 1000)
    };

    console.log('Tokens refreshed successfully');
    return tokenStore;
  } catch (error) {
    console.error('Token refresh error:', error.response?.data || error.message);
    // Clear the token store on refresh failure
    tokenStore = {
      access_token: null,
      refresh_token: null,
      expires_at: null,
      obtained_at: null
    };
    throw new Error('Failed to refresh tokens');
  }
}

/**
 * Get the current access token, refreshing if necessary
 * @returns {Promise<string>} The access token
 */
async function getAccessToken() {
  // If we don't have a token or it's expired, try to refresh
  if (!tokenStore.access_token || Date.now() >= tokenStore.expires_at) {
    // If we have a refresh token, try to refresh
    if (tokenStore.refresh_token) {
      try {
        await refreshToken();
      } catch (error) {
        throw new Error('Failed to get access token');
      }
    } else {
      throw new Error('No tokens available');
    }
  }

  return tokenStore.access_token;
}

/**
 * Check if we have a valid access token
 * @returns {boolean} Whether we have a valid token
 */
function hasValidToken() {
  return (
    tokenStore.access_token && 
    tokenStore.expires_at && 
    Date.now() < tokenStore.expires_at
  );
}

/**
 * Get the token status
 * @returns {Object} The token status
 */
function getTokenStatus() {
  return {
    has_token: !!tokenStore.access_token,
    is_valid: hasValidToken(),
    expires_in: tokenStore.expires_at ? Math.floor((tokenStore.expires_at - Date.now()) / 1000) : null,
    obtained_at: tokenStore.obtained_at
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
      // If we have a token and it expires within the next 20 minutes, refresh it
      if (
        tokenStore.access_token &&
        tokenStore.expires_at &&
        Date.now() + 20 * 60 * 1000 >= tokenStore.expires_at
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