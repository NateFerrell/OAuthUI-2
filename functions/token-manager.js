/**
 * Token Manager for StockX OAuth
 * 
 * This module handles token storage, refresh, and management using Cloudflare KV
 * and Durable Objects for persistence.
 */

// Default configuration
const DEFAULT_CONFIG = {
  clientId: 'KlbEZjymb9OBap9a3jWlX9bIx4j4y3ks',
  clientSecret: 'y2GqspIoDSgzoryXS3Ue--5i0xlXQUU09F4cqnuVgn6Szk4efqZy1qGip_EVqmqe',
  redirectUri: 'https://stockx-consignment-portal.pages.dev/callback',
  authDomain: 'accounts.stockx.com',
  apiDomain: 'api.stockx.com', 
  scope: 'offline_access openid',
  audience: 'gateway.stockx.com',
  refreshBuffer: 15 * 60 * 1000, // Refresh tokens 15 minutes before expiry
};

/**
 * Get or create a token manager instance
 */
export function getTokenManager(env) {
  // Use the singleton token manager
  if (!globalThis.tokenManager) {
    // Create a new token manager
    const config = {
      ...DEFAULT_CONFIG,
      clientId: env.STOCKX_CLIENT_ID || DEFAULT_CONFIG.clientId,
      clientSecret: env.STOCKX_CLIENT_SECRET || DEFAULT_CONFIG.clientSecret,
      redirectUri: env.REDIRECT_URI || DEFAULT_CONFIG.redirectUri,
    };
    
    globalThis.tokenManager = new TokenManager(env.TOKEN_STORE, config);
  }
  
  return globalThis.tokenManager;
}

/**
 * Token Manager Class
 */
class TokenManager {
  constructor(kv, config) {
    this.kv = kv;
    this.config = config;
    this.isRefreshing = false;
    this.refreshTimer = null;
    this.initialized = false;
    this.tokens = null;
  }
  
  /**
   * Initialize the token manager
   */
  async init() {
    if (this.initialized) return;
    
    try {
      // Load tokens from KV storage
      this.tokens = await this.loadTokens();
      
      // Start a refresh timer if we have tokens
      if (this.tokens && this.tokens.refresh_token) {
        this.setupRefreshTimer();
      }
      
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize token manager:', error);
      return false;
    }
  }
  
  /**
   * Load tokens from KV storage
   */
  async loadTokens() {
    try {
      const tokens = await this.kv.get('oauth-tokens', { type: 'json' });
      return tokens || {
        access_token: null,
        refresh_token: null,
        expires_at: null,
        obtained_at: null,
        refresh_count: 0
      };
    } catch (error) {
      console.error('Error loading tokens from KV:', error);
      return {
        access_token: null,
        refresh_token: null,
        expires_at: null,
        obtained_at: null,
        refresh_count: 0
      };
    }
  }
  
  /**
   * Save tokens to KV storage
   */
  async saveTokens(tokens) {
    try {
      this.tokens = tokens;
      await this.kv.put('oauth-tokens', JSON.stringify(tokens));
      return true;
    } catch (error) {
      console.error('Error saving tokens to KV:', error);
      return false;
    }
  }
  
  /**
   * Setup a timer to refresh the token before it expires
   */
  setupRefreshTimer() {
    // Clear any existing timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    
    // If we don't have valid token data, don't set up a timer
    if (!this.tokens || !this.tokens.expires_at) {
      return;
    }
    
    // Calculate when to refresh the token
    const now = Date.now();
    const refreshAt = this.tokens.expires_at - this.config.refreshBuffer;
    
    // If already past refresh time, refresh immediately
    if (now >= refreshAt) {
      console.log('Token needs immediate refresh');
      setTimeout(() => this.refreshAccessToken(), 0);
      return;
    }
    
    // Set up a timer to refresh before expiry
    const timeout = refreshAt - now;
    console.log(`Setting up token refresh in ${Math.floor(timeout/1000/60)} minutes`);
    
    this.refreshTimer = setTimeout(() => {
      this.refreshAccessToken();
    }, timeout);
  }
  
  /**
   * Generate an authorization URL
   */
  getAuthorizationUrl() {
    // Generate state parameter for security
    const state = this.generateRandomState();
    
    // Build the authorization URL
    const authUrl = `https://${this.config.authDomain}/authorize?` +
      `response_type=code&` +
      `client_id=${encodeURIComponent(this.config.clientId)}&` +
      `redirect_uri=${encodeURIComponent(this.config.redirectUri)}&` +
      `scope=${encodeURIComponent(this.config.scope)}&` +
      `audience=${encodeURIComponent(this.config.audience)}&` +
      `state=${encodeURIComponent(state)}`;
    
    return { authUrl, state };
  }
  
  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code) {
    // Build the token request body
    const tokenData = new URLSearchParams();
    tokenData.append('grant_type', 'authorization_code');
    tokenData.append('client_id', this.config.clientId);
    tokenData.append('client_secret', this.config.clientSecret);
    tokenData.append('code', code);
    tokenData.append('redirect_uri', this.config.redirectUri);
    
    // Make the token exchange request
    const response = await fetch(`https://${this.config.authDomain}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: tokenData.toString()
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Token exchange failed: ${errorData}`);
    }
    
    const responseData = await response.json();
    
    // Store the tokens with expiration timestamp
    const tokens = {
      access_token: responseData.access_token,
      refresh_token: responseData.refresh_token,
      id_token: responseData.id_token,
      token_type: responseData.token_type || 'Bearer',
      expires_in: responseData.expires_in || 43200, // Default 12 hours
      obtained_at: Date.now(),
      expires_at: Date.now() + ((responseData.expires_in || 43200) * 1000),
      refresh_count: 0
    };
    
    // Save tokens to KV
    await this.saveTokens(tokens);
    
    // Set up refresh timer
    this.setupRefreshTimer();
    
    return tokens;
  }
  
  /**
   * Refresh the access token using refresh token
   */
  async refreshAccessToken() {
    // Prevent multiple concurrent refresh attempts
    if (this.isRefreshing) {
      console.log('Token refresh already in progress');
      return;
    }
    
    this.isRefreshing = true;
    
    try {
      // Ensure we have the latest tokens
      this.tokens = await this.loadTokens();
      
      if (!this.tokens || !this.tokens.refresh_token) {
        throw new Error('No refresh token available');
      }
      
      console.log(`Refreshing access token (refresh count: ${this.tokens.refresh_count || 0})`);
      
      // Build the token request body
      const tokenData = new URLSearchParams();
      tokenData.append('grant_type', 'refresh_token');
      tokenData.append('client_id', this.config.clientId);
      tokenData.append('client_secret', this.config.clientSecret);
      tokenData.append('refresh_token', this.tokens.refresh_token);
      
      // Make the token refresh request
      const response = await fetch(`https://${this.config.authDomain}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: tokenData.toString()
      });
      
      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Token refresh failed: ${errorData}`);
      }
      
      const responseData = await response.json();
      
      // Update token information
      const updatedTokens = {
        ...this.tokens,
        access_token: responseData.access_token,
        refresh_token: responseData.refresh_token || this.tokens.refresh_token,
        id_token: responseData.id_token || this.tokens.id_token,
        token_type: responseData.token_type || 'Bearer',
        expires_in: responseData.expires_in || 43200,
        obtained_at: Date.now(),
        expires_at: Date.now() + ((responseData.expires_in || 43200) * 1000),
        refresh_count: (this.tokens.refresh_count || 0) + 1,
        last_refresh: Date.now()
      };
      
      // Save updated tokens
      await this.saveTokens(updatedTokens);
      
      // Set up the next refresh
      this.setupRefreshTimer();
      
      console.log('Token refreshed successfully');
      this.isRefreshing = false;
      return updatedTokens;
    } catch (error) {
      console.error('Token refresh error:', error);
      this.isRefreshing = false;
      
      // If the error indicates the refresh token is invalid, clear tokens
      if (error.message && error.message.includes('invalid_grant')) {
        console.log('Refresh token invalid, clearing tokens');
        await this.clearTokens();
      }
      
      throw error;
    }
  }
  
  /**
   * Get a valid access token, refreshing if necessary
   */
  async getAccessToken() {
    // Initialize if not done already
    if (!this.initialized) {
      await this.init();
    }
    
    // Ensure we have the latest tokens
    this.tokens = await this.loadTokens();
    
    if (!this.tokens || !this.tokens.access_token) {
      throw new Error('No access token available');
    }
    
    // Check if token is expired or about to expire
    const now = Date.now();
    const isExpiring = this.tokens.expires_at && now >= (this.tokens.expires_at - 60000); // 1 minute buffer
    
    // If token is expiring soon or expired, refresh it
    if (isExpiring) {
      try {
        const refreshedTokens = await this.refreshAccessToken();
        return refreshedTokens.access_token;
      } catch (refreshError) {
        console.error('Failed to refresh token:', refreshError);
        
        // If the token isn't expired yet, we can still use it
        if (this.tokens.expires_at && now < this.tokens.expires_at) {
          console.log('Using existing token despite refresh failure');
          return this.tokens.access_token;
        }
        
        throw refreshError;
      }
    }
    
    return this.tokens.access_token;
  }
  
  /**
   * Get the current token status
   */
  async getTokenStatus() {
    // Ensure we have the latest tokens
    this.tokens = await this.loadTokens();
    
    if (!this.tokens || !this.tokens.access_token) {
      return {
        has_tokens: false,
        message: 'Not authenticated'
      };
    }
    
    const now = Date.now();
    const isExpired = this.tokens.expires_at && now >= this.tokens.expires_at;
    const expiresIn = isExpired ? 0 : Math.floor((this.tokens.expires_at - now) / 1000);
    const isExpiringSoon = !isExpired && expiresIn < 600; // Less than 10 minutes
    
    return {
      has_tokens: true,
      has_access_token: !!this.tokens.access_token,
      has_refresh_token: !!this.tokens.refresh_token,
      is_valid: !isExpired,
      is_expiring_soon: isExpiringSoon,
      expires_in_seconds: expiresIn,
      expires_at: this.tokens.expires_at,
      obtained_at: this.tokens.obtained_at,
      last_refresh: this.tokens.last_refresh,
      refresh_count: this.tokens.refresh_count || 0,
      access_token_preview: this.tokens.access_token ? 
        `${this.tokens.access_token.substring(0, 10)}...` : null
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
    
    // Reset tokens
    const emptyTokens = {
      access_token: null,
      refresh_token: null,
      expires_at: null,
      obtained_at: null,
      refresh_count: 0
    };
    
    // Save empty tokens to KV
    await this.saveTokens(emptyTokens);
    return { success: true };
  }
  
  /**
   * Generate a random state parameter
   */
  generateRandomState() {
    // Generate a random string for state
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }
}