/**
 * API routes for StockX OAuth authentication
 */

// Global state store for auth flow
const stateStore = new Map();

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    return handleCors(request);
  }
  
  // Route to specific handlers based on the path
  if (path.endsWith('/status')) {
    return handleStatus(request, env);
  } else if (path.endsWith('/init')) {
    return handleInit(request, env);
  } else if (path.endsWith('/callback')) {
    return handleCallback(request, env);
  } else if (path.endsWith('/clear')) {
    return handleClear(request, env);
  }
  
  // Default 404 for unknown paths
  return new Response(JSON.stringify({ error: 'Not Found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Handle status check requests
 */
async function handleStatus(request, env) {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { 
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const status = await getTokenStatus(env);
    return new Response(JSON.stringify(status), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Status check error:', error);
    return new Response(JSON.stringify({ 
      error: 'Error checking auth status', 
      message: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle auth initialization requests
 */
async function handleInit(request, env) {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { 
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // Generate authorization URL and state
    const { authUrl, state } = getAuthorizationUrl(env);
    
    // Store the state for verification
    stateStore.set(state, { created: Date.now() });
    
    // Clean up old states
    cleanupStates();
    
    return new Response(JSON.stringify({ authUrl, state }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Auth init error:', error);
    return new Response(JSON.stringify({ 
      error: 'Error initializing auth', 
      message: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle auth callback requests
 */
async function handleCallback(request, env) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { 
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const data = await request.json();
    const { code, state } = data;
    
    if (!code) {
      return new Response(JSON.stringify({ error: 'Authorization code is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Verify state if provided
    if (state && !stateStore.has(state)) {
      return new Response(JSON.stringify({ error: 'Invalid state parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Clear state after verification
    if (state) {
      stateStore.delete(state);
    }
    
    // Exchange code for tokens
    await exchangeCodeForTokens(code, env);
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Auth callback error:', error);
    return new Response(JSON.stringify({ 
      error: 'Error processing authentication', 
      message: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle token clear requests
 */
async function handleClear(request, env) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { 
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // Clear the tokens
    await clearTokens(env);
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Auth clear error:', error);
    return new Response(JSON.stringify({ 
      error: 'Error clearing auth tokens', 
      message: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle CORS preflight requests
 */
function handleCors(request) {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Max-Age': '86400',
    }
  });
}

/**
 * Clean up old states
 */
function cleanupStates() {
  const now = Date.now();
  for (const [state, data] of stateStore.entries()) {
    // Remove states older than 10 minutes
    if (now - data.created > 10 * 60 * 1000) {
      stateStore.delete(state);
    }
  }
}

/**
 * Generate authorization URL
 */
function getAuthorizationUrl(env) {
  // Generate state parameter for security
  const state = generateRandomState();
  
  // Get config from environment
  const clientId = env.STOCKX_CLIENT_ID;
  const redirectUri = env.REDIRECT_URI;
  
  // Build the authorization URL
  const authUrl = `https://accounts.stockx.com/authorize?` +
    `response_type=code&` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `scope=${encodeURIComponent('offline_access openid')}&` +
    `audience=${encodeURIComponent('gateway.stockx.com')}&` +
    `state=${encodeURIComponent(state)}`;
  
  return { authUrl, state };
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(code, env) {
  const clientId = env.STOCKX_CLIENT_ID;
  const clientSecret = env.STOCKX_CLIENT_SECRET;
  const redirectUri = env.REDIRECT_URI;
  
  // Build the token request body
  const tokenData = new URLSearchParams();
  tokenData.append('grant_type', 'authorization_code');
  tokenData.append('client_id', clientId);
  tokenData.append('client_secret', clientSecret);
  tokenData.append('code', code);
  tokenData.append('redirect_uri', redirectUri);
  
  // Make the token exchange request
  const response = await fetch('https://accounts.stockx.com/oauth/token', {
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
  
  const data = await response.json();
  
  // Prepare tokens for storage
  const tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    id_token: data.id_token,
    token_type: data.token_type || 'Bearer',
    expires_in: data.expires_in || 43200, // Default 12 hours
    obtained_at: Date.now(),
    expires_at: Date.now() + ((data.expires_in || 43200) * 1000),
    refresh_count: 0
  };
  
  // Save the tokens
  return saveTokens(tokens, env);
}

/**
 * Get token status
 */
async function getTokenStatus(env) {
  const tokens = await loadTokens(env);
  
  if (!tokens || !tokens.access_token) {
    return {
      authenticated: false,
      message: 'Not authenticated'
    };
  }
  
  const now = Date.now();
  const isExpired = tokens.expires_at && now >= tokens.expires_at;
  const expiresIn = isExpired ? 0 : Math.floor((tokens.expires_at - now) / 1000);
  const isExpiringSoon = !isExpired && expiresIn < 600; // Less than 10 minutes
  const refreshBuffer = 15 * 60 * 1000; // 15 minutes before expiry
  
  return {
    authenticated: true,
    valid: !isExpired,
    expires_in_seconds: expiresIn,
    expires_at: tokens.expires_at ? new Date(tokens.expires_at).toISOString() : null,
    obtained_at: tokens.obtained_at ? new Date(tokens.obtained_at).toISOString() : null,
    refresh_token_available: !!tokens.refresh_token,
    refresh_count: tokens.refresh_count || 0,
    next_refresh_in_seconds: !isExpired ? Math.floor((tokens.expires_at - refreshBuffer - now) / 1000) : null
  };
}

/**
 * Clear all tokens
 */
async function clearTokens(env) {
  const emptyTokens = {
    access_token: null,
    refresh_token: null,
    expires_at: null,
    obtained_at: null,
    refresh_count: 0
  };
  
  await saveTokens(emptyTokens, env);
  return true;
}

/**
 * Load tokens from KV
 */
async function loadTokens(env) {
  try {
    const tokens = await env.TOKEN_STORE.get('oauth-tokens', { type: 'json' });
    return tokens || {
      access_token: null,
      refresh_token: null,
      expires_at: null,
      obtained_at: null,
      refresh_count: 0
    };
  } catch (error) {
    console.error('Error loading tokens:', error);
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
 * Save tokens to KV
 */
async function saveTokens(tokens, env) {
  try {
    await env.TOKEN_STORE.put('oauth-tokens', JSON.stringify(tokens));
    return true;
  } catch (error) {
    console.error('Error saving tokens:', error);
    return false;
  }
}

/**
 * Generate a random state parameter
 */
function generateRandomState() {
  // Generate a random string for state
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}