/**
 * StockX OAuth Refresh Token Manager
 * 
 * This module handles the complete OAuth flow and token management:
 * 1. Initial authorization and token acquisition
 * 2. Secure token storage
 * 3. Automatic token refresh
 * 4. Background token monitoring
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const config = {
  clientId: process.env.STOCKX_CLIENT_ID || 'KlbEZjymb9OBap9a3jWlX9bIx4j4y3ks',
  clientSecret: process.env.STOCKX_CLIENT_SECRET || 'y2GqspIoDSgzoryXS3Ue--5i0xlXQUU09F4cqnuVgn6Szk4efqZy1qGip_EVqmqe',
  redirectUri: process.env.REDIRECT_URI || 'https://stockx-consignment-portal.pages.dev/callback',
  authDomain: 'accounts.stockx.com',
  audience: 'gateway.stockx.com',
  apiBase: 'https://api.stockx.com',
  tokenFile: process.env.TOKEN_FILE || path.join(process.cwd(), 'tokens.json'),
  refreshBeforeExpiryMs: 10 * 60 * 1000, // Refresh 10 minutes before expiry
  tokenCheckIntervalMs: 5 * 60 * 1000,   // Check token every 5 minutes
};

/**
 * Token storage handler
 */
class TokenStorage {
  constructor(filePath) {
    this.filePath = filePath;
    this.tokens = null;
    this.callbacks = [];
  }
  
  /**
   * Load tokens from storage
   */
  async load() {
    try {
      const data = await fs.readFile(this.filePath, 'utf8');
      this.tokens = JSON.parse(data);
      return this.tokens;
    } catch (error) {
      // If file doesn't exist or is invalid, return null
      this.tokens = null;
      return null;
    }
  }
  
  /**
   * Save tokens to storage
   */
  async save(tokens) {
    try {
      this.tokens = tokens;
      await fs.writeFile(this.filePath, JSON.stringify(tokens, null, 2), 'utf8');
      
      // Notify all registered callbacks
      this.callbacks.forEach(callback => callback(tokens));
      
      return true;
    } catch (error) {
      console.error('Error saving tokens:', error);
      return false;
    }
  }
  
  /**
   * Register a callback for token updates
   */
  onTokenUpdate(callback) {
    if (typeof callback === 'function') {
      this.callbacks.push(callback);
    }
  }
}

/**
 * StockX OAuth Manager
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
    try {
      // Load tokens from storage
      const tokens = await this.storage.load();
      
      // Start background token monitoring
      this.startTokenMonitoring();
      
      this.initialized = true;
      return tokens !== null;
    } catch (error) {
      console.error('Error initializing OAuth manager:', error);
      return false;
    }
  }
  
  /**
   * Generate an authorization URL
   */
  getAuthorizationUrl(state) {
    // Generate a random state if not provided
    const secureState = state || this._generateRandomState();
    
    // Build the authorization URL
    const authUrl = `https://${this.config.authDomain}/authorize?` +
      `response_type=code&` +
      `client_id=${encodeURIComponent(this.config.clientId)}&` +
      `redirect_uri=${encodeURIComponent(this.config.redirectUri)}&` +
      `scope=${encodeURIComponent('offline_access openid')}&` +
      `audience=${encodeURIComponent(this.config.audience)}&` +
      `state=${encodeURIComponent(secureState)}`;
    
    return { authUrl, state: secureState };
  }
  
  /**
   * Exchange an authorization code for tokens
   */
  async exchangeCodeForTokens(code) {
    try {
      // Build the token request body
      const tokenData = new URLSearchParams();
      tokenData.append('grant_type', 'authorization_code');
      tokenData.append('client_id', this.config.clientId);
      tokenData.append('client_secret', this.config.clientSecret);
      tokenData.append('code', code);
      tokenData.append('redirect_uri', this.config.redirectUri);
      
      // Make the token exchange request
      const response = await axios.post(
        `https://${this.config.authDomain}/oauth/token`,
        tokenData.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      
      // Add timestamps and expiry info
      const tokens = {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        id_token: response.data.id_token,
        token_type: response.data.token_type,
        expires_in: response.data.expires_in || 43200, // Default 12 hours
        obtained_at: Date.now(),
        expires_at: Date.now() + ((response.data.expires_in || 43200) * 1000),
        refresh_count: 0
      };
      
      // Save tokens to storage
      await this.storage.save(tokens);
      
      // Schedule refresh
      this._scheduleRefresh(tokens);
      
      return tokens;
    } catch (error) {
      console.error('Error exchanging code for tokens:', error.response?.data || error.message);
      throw new Error('Failed to exchange authorization code for tokens');
    }
  }
  
  /**
   * Refresh the access token using the refresh token
   */
  async refreshAccessToken() {
    // Prevent multiple concurrent refresh attempts
    if (this.isRefreshing) {
      console.log('Token refresh already in progress, skipping duplicate request');
      return;
    }
    
    this.isRefreshing = true;
    
    try {
      // Load current tokens
      const tokens = await this.storage.load();
      
      if (!tokens || !tokens.refresh_token) {
        throw new Error('No refresh token available');
      }
      
      console.log(`Refreshing access token (refresh count: ${tokens.refresh_count || 0})`);
      
      // Build the token request body
      const tokenData = new URLSearchParams();
      tokenData.append('grant_type', 'refresh_token');
      tokenData.append('client_id', this.config.clientId);
      tokenData.append('client_secret', this.config.clientSecret);
      tokenData.append('refresh_token', tokens.refresh_token);
      
      // Make the token refresh request
      const response = await axios.post(
        `https://${this.config.authDomain}/oauth/token`,
        tokenData.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      
      // Update token information
      const updatedTokens = {
        ...tokens,
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token || tokens.refresh_token,
        id_token: response.data.id_token || tokens.id_token,
        expires_in: response.data.expires_in || 43200,
        obtained_at: Date.now(),
        expires_at: Date.now() + ((response.data.expires_in || 43200) * 1000),
        refresh_count: (tokens.refresh_count || 0) + 1,
        last_refresh: Date.now()
      };
      
      // Save updated tokens
      await this.storage.save(updatedTokens);
      
      // Schedule next refresh
      this._scheduleRefresh(updatedTokens);
      
      console.log('Token refreshed successfully');
      this.isRefreshing = false;
      return updatedTokens;
    } catch (error) {
      console.error('Token refresh error:', error.response?.data || error.message);
      this.isRefreshing = false;
      
      // Handle refresh token expired/invalid
      if (
        error.response?.status === 400 && 
        (error.response?.data?.error === 'invalid_grant' || error.response?.data?.error_description?.includes('invalid refresh token'))
      ) {
        console.error('Refresh token is invalid or expired, clearing tokens');
        await this.storage.save(null);
      }
      
      throw new Error('Failed to refresh access token');
    }
  }
  
  /**
   * Get a valid access token, refreshing if necessary
   */
  async getAccessToken() {
    try {
      const tokens = await this.storage.load();
      
      if (!tokens || !tokens.access_token) {
        throw new Error('No access token available');
      }
      
      // Check if token is expired or about to expire
      const now = Date.now();
      const isExpiring = tokens.expires_at && now >= (tokens.expires_at - this.config.refreshBeforeExpiryMs);
      
      // If token is expiring soon or expired, refresh it
      if (isExpiring) {
        try {
          const refreshedTokens = await this.refreshAccessToken();
          return refreshedTokens.access_token;
        } catch (refreshError) {
          console.error('Failed to refresh token:', refreshError);
          
          // If the token isn't expired yet, we can still use it
          if (tokens.expires_at && now < tokens.expires_at) {
            console.log('Using existing token even though refresh failed');
            return tokens.access_token;
          }
          
          throw refreshError;
        }
      }
      
      return tokens.access_token;
    } catch (error) {
      console.error('Error getting access token:', error);
      throw new Error('Failed to get access token');
    }
  }
  
  /**
   * Get the OAuth token status
   */
  async getTokenStatus() {
    const tokens = await this.storage.load();
    
    if (!tokens || !tokens.access_token) {
      return {
        has_tokens: false,
        message: 'No tokens available'
      };
    }
    
    const now = Date.now();
    const isExpired = tokens.expires_at && now >= tokens.expires_at;
    const expiresIn = isExpired ? 0 : Math.floor((tokens.expires_at - now) / 1000);
    const isExpiringSoon = !isExpired && expiresIn < 60 * 10; // Less than 10 minutes
    
    return {
      has_tokens: true,
      has_access_token: !!tokens.access_token,
      has_refresh_token: !!tokens.refresh_token,
      is_valid: !isExpired,
      is_expiring_soon: isExpiringSoon,
      expires_in_seconds: expiresIn,
      obtained_at: tokens.obtained_at,
      last_refresh: tokens.last_refresh,
      refresh_count: tokens.refresh_count || 0,
      access_token_preview: tokens.access_token ? `${tokens.access_token.substring(0, 10)}...` : null
    };
  }
  
  /**
   * Register a callback for token updates
   */
  onTokenUpdate(callback) {
    this.storage.onTokenUpdate(callback);
  }
  
  /**
   * Start background token monitoring
   */
  startTokenMonitoring() {
    // Clear existing timer if any
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    
    // Set up interval to check token status
    this.refreshTimer = setInterval(async () => {
      try {
        const tokens = await this.storage.load();
        
        if (!tokens || !tokens.access_token || !tokens.refresh_token) {
          return; // No tokens to monitor
        }
        
        // Check if token is expired or about to expire
        const now = Date.now();
        const isExpiring = tokens.expires_at && now >= (tokens.expires_at - this.config.refreshBeforeExpiryMs);
        
        // If token is expiring soon, refresh it
        if (isExpiring) {
          console.log('Token is expiring soon, refreshing automatically');
          await this.refreshAccessToken();
        }
      } catch (error) {
        console.error('Error in token monitoring:', error);
      }
    }, this.config.tokenCheckIntervalMs);
    
    console.log('Token monitoring started');
  }
  
  /**
   * Schedule a token refresh based on expiry time
   */
  _scheduleRefresh(tokens) {
    if (!tokens || !tokens.expires_at) {
      return;
    }
    
    const now = Date.now();
    const refreshTime = tokens.expires_at - this.config.refreshBeforeExpiryMs;
    
    // If refresh time is in the past, refresh immediately
    if (refreshTime <= now) {
      console.log('Token is already expired or about to expire, refreshing immediately');
      setTimeout(() => this.refreshAccessToken(), 1000);
      return;
    }
    
    // Calculate delay until refresh
    const delayMs = refreshTime - now;
    console.log(`Scheduling token refresh in ${Math.floor(delayMs / 60000)} minutes`);
    
    // Schedule refresh
    setTimeout(() => this.refreshAccessToken(), delayMs);
  }
  
  /**
   * Generate a random state parameter
   */
  _generateRandomState() {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  
  /**
   * Create a configured axios instance with auth headers
   */
  async createAuthenticatedClient() {
    try {
      const accessToken = await this.getAccessToken();
      
      return axios.create({
        baseURL: this.config.apiBase,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-api-key': this.config.clientId
        }
      });
    } catch (error) {
      console.error('Error creating authenticated client:', error);
      throw new Error('Failed to create authenticated API client');
    }
  }
}

module.exports = new StockXOAuthManager(config);