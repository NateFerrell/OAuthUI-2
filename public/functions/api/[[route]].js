/**
 * API route handler for auth and StockX endpoints
 */

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    return handleCors(request);
  }

  // Handle different API routes
  if (path.startsWith('/api/auth/')) {
    return handleAuth(path, request, env);
  } else if (path.startsWith('/api/stockx/')) {
    return handleStockx(path, request, env);
  }

  // Default 404 response for unknown API paths
  return new Response(JSON.stringify({ error: 'Not Found' }), {
    status: 404,
    headers: corsHeaders()
  });
}

/**
 * Handle authentication endpoints
 */
async function handleAuth(path, request, env) {
  // In-memory state store for auth flow
  if (!global.stateStore) {
    global.stateStore = new Map();
  }
  
  // Sub-routes for auth
  if (path.endsWith('/status')) {
    return handleAuthStatus(request, env);
  } else if (path.endsWith('/init')) {
    return handleAuthInit(request, env);
  } else if (path.endsWith('/callback')) {
    return handleAuthCallback(request, env);
  } else if (path.endsWith('/clear')) {
    return handleAuthClear(request, env);
  }
  
  return new Response(JSON.stringify({ error: 'Not Found' }), {
    status: 404,
    headers: corsHeaders()
  });
}

/**
 * Handle StockX API proxy endpoints
 */
async function handleStockx(path, request, env) {
  try {
    const accessToken = await getAccessToken(env);
    
    if (!accessToken) {
      return new Response(JSON.stringify({
        error: 'Not authenticated',
        message: 'No access token available. Please authenticate first.'
      }), {
        status: 401,
        headers: corsHeaders()
      });
    }
    
    // Extract the StockX API path
    const stockxPath = path.replace(/^\/api\/stockx\//, '');
    
    // Build the StockX API URL
    const stockxApiUrl = new URL(stockxPath, 'https://api.stockx.com/');
    
    // Copy query parameters
    const url = new URL(request.url);
    url.searchParams.forEach((value, key) => {
      stockxApiUrl.searchParams.append(key, value);
    });
    
    // Create the request for the StockX API
    const stockxReq = new Request(stockxApiUrl, {
      method: request.method,
      headers: new Headers(request.headers),
      body: ['GET', 'HEAD'].includes(request.method) ? null : await request.clone().arrayBuffer(),
      redirect: 'follow'
    });
    
    // Add StockX authentication headers
    stockxReq.headers.set('Authorization', `Bearer ${accessToken}`);
    stockxReq.headers.set('x-api-key', env.STOCKX_API_KEY || 'OEgPz70FHNL5AxwwK8fJ92Uyk18knTDOdTBxPmi0');
    stockxReq.headers.set('Content-Type', 'application/json');
    
    // Forward the request to StockX API
    const response = await fetch(stockxReq);
    
    // Handle 401 by refreshing token and retrying
    if (response.status === 401) {
      try {
        // Refresh the token
        const newAccessToken = await refreshAccessToken(env);
        
        // Retry the request with the new token
        stockxReq.headers.set('Authorization', `Bearer ${newAccessToken}`);
        const retryResponse = await fetch(stockxReq);
        
        // Create a new response with CORS headers
        return createCorsResponse(retryResponse);
      } catch (error) {
        console.error('Error refreshing token:', error);
        return new Response(JSON.stringify({ 
          error: 'Authentication Error', 
          message: 'Failed to refresh authentication token.' 
        }), {
          status: 401,
          headers: corsHeaders()
        });
      }
    }
    
    // Create a new response with CORS headers
    return createCorsResponse(response);
  } catch (error) {
    console.error('StockX API error:', error);
    return new Response(JSON.stringify({ 
      error: 'API Error', 
      message: error.message 
    }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}

/**
 * Handle auth status endpoint
 */
async function handleAuthStatus(request, env) {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: corsHeaders()
    });
  }
  
  try {
    const status = await getTokenStatus(env);
    return new Response(JSON.stringify(status), {
      headers: corsHeaders()
    });
  } catch (error) {
    console.error('Status check error:', error);
    return new Response(JSON.stringify({ 
      error: 'Error checking auth status', 
      message: error.message 
    }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}

/**
 * Handle auth initialization endpoint
 */
async function handleAuthInit(request, env) {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: corsHeaders()
    });
  }
  
  try {
    // Generate a state parameter for security
    const state = generateRandomState();
    
    // Store the state in memory for verification
    global.stateStore.set(state, { created: Date.now() });
    
    // Clean up old states
    cleanupStates();
    
    // Build the authorization URL
    const redirectUri = env.REDIRECT_URI || 'https://stockx-consignment-portal.pages.dev/callback';
    const clientId = env.STOCKX_CLIENT_ID || 'KlbEZjymb9OBap9a3jWlX9bIx4j4y3ks';
    
    const authUrl = `https://accounts.stockx.com/authorize?` +
      `response_type=code&` +
      `client_id=${encodeURIComponent(clientId)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent('offline_access openid')}&` +
      `audience=${encodeURIComponent('gateway.stockx.com')}&` +
      `state=${encodeURIComponent(state)}`;
    
    return new Response(JSON.stringify({ authUrl, state }), {
      headers: corsHeaders()
    });
  } catch (error) {
    console.error('Auth init error:', error);
    return new Response(JSON.stringify({ 
      error: 'Error initializing auth', 
      message: error.message 
    }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}

/**
 * Handle auth callback endpoint
 */
async function handleAuthCallback(request, env) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: corsHeaders()
    });
  }
  
  try {
    const data = await request.json();
    const { code, state } = data;
    
    if (!code) {
      return new Response(JSON.stringify({ error: 'Authorization code is required' }), {
        status: 400,
        headers: corsHeaders()
      });
    }
    
    // Verify state if provided
    if (state && !global.stateStore.has(state)) {
      return new Response(JSON.stringify({ error: 'Invalid state parameter' }), {
        status: 400,
        headers: corsHeaders()
      });
    }
    
    // Clear state after verification
    if (state) {
      global.stateStore.delete(state);
    }
    
    // Exchange code for tokens
    await exchangeCodeForTokens(code, env);
    
    return new Response(JSON.stringify({ success: true }), {
      headers: corsHeaders()
    });
  } catch (error) {
    console.error('Auth callback error:', error);
    return new Response(JSON.stringify({ 
      error: 'Error processing authentication', 
      message: error.message 
    }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}

/**
 * Handle auth clear endpoint
 */
async function handleAuthClear(request, env) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: corsHeaders()
    });
  }
  
  try {
    // Clear the tokens
    await clearTokens(env);
    
    return new Response(JSON.stringify({ success: true }), {
      headers: corsHeaders()
    });
  } catch (error) {
    console.error('Auth clear error:', error);
    return new Response(JSON.stringify({ 
      error: 'Error clearing auth tokens', 
      message: error.message 
    }), {
      status: 500,
      headers: corsHeaders()
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
 * Get CORS headers
 */
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };
}

/**
 * Create a response with CORS headers
 */
function createCorsResponse(response) {
  const headers = new Headers(response.headers);
  
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

/**
 * Generate a random state parameter
 */
function generateRandomState() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Clean up old states
 */
function cleanupStates() {
  const now = Date.now();
  for (const [state, data] of global.stateStore.entries()) {
    // Remove states older than 10 minutes
    if (now - data.created > 10 * 60 * 1000) {
      global.stateStore.delete(state);
    }
  }
}

/**
 * Exchange an authorization code for tokens
 */
async function exchangeCodeForTokens(code, env) {
  const clientId = env.STOCKX_CLIENT_ID || 'KlbEZjymb9OBap9a3jWlX9bIx4j4y3ks';
  const clientSecret = env.STOCKX_CLIENT_SECRET || 'y2GqspIoDSgzoryXS3Ue--5i0xlXQUU09F4cqnuVgn6Szk4efqZy1qGip_EVqmqe';
  const redirectUri = env.REDIRECT_URI || 'https://stockx-consignment-portal.pages.dev/callback';
  
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
 * Refresh the access token
 */
async function refreshAccessToken(env) {
  const tokens = await loadTokens(env);
  
  if (!tokens || !tokens.refresh_token) {
    throw new Error('No refresh token available');
  }
  
  const clientId = env.STOCKX_CLIENT_ID || 'KlbEZjymb9OBap9a3jWlX9bIx4j4y3ks';
  const clientSecret = env.STOCKX_CLIENT_SECRET || 'y2GqspIoDSgzoryXS3Ue--5i0xlXQUU09F4cqnuVgn6Szk4efqZy1qGip_EVqmqe';
  
  // Build the token refresh request body
  const tokenData = new URLSearchParams();
  tokenData.append('grant_type', 'refresh_token');
  tokenData.append('client_id', clientId);
  tokenData.append('client_secret', clientSecret);
  tokenData.append('refresh_token', tokens.refresh_token);
  
  // Make the token refresh request
  const response = await fetch('https://accounts.stockx.com/oauth/token', {
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
  
  const data = await response.json();
  
  // Update tokens
  const updatedTokens = {
    ...tokens,
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokens.refresh_token,
    id_token: data.id_token || tokens.id_token,
    token_type: data.token_type || tokens.token_type || 'Bearer',
    expires_in: data.expires_in || 43200,
    obtained_at: Date.now(),
    expires_at: Date.now() + ((data.expires_in || 43200) * 1000),
    refresh_count: (tokens.refresh_count || 0) + 1,
    last_refresh: Date.now()
  };
  
  // Save the updated tokens
  await saveTokens(updatedTokens, env);
  
  return updatedTokens.access_token;
}

/**
 * Get a valid access token
 */
async function getAccessToken(env) {
  const tokens = await loadTokens(env);
  
  if (!tokens || !tokens.access_token) {
    return null;
  }
  
  // Check if token is expired or will expire soon
  const now = Date.now();
  const isExpired = tokens.expires_at && now >= tokens.expires_at;
  const willExpireSoon = tokens.expires_at && now >= (tokens.expires_at - 60000); // 1 minute buffer
  
  if (isExpired || willExpireSoon) {
    // Try to refresh the token if we have a refresh token
    if (tokens.refresh_token) {
      try {
        return await refreshAccessToken(env);
      } catch (error) {
        console.error('Error refreshing token:', error);
        
        // If not expired yet, we can still use it
        if (!isExpired) {
          return tokens.access_token;
        }
        
        return null;
      }
    }
    
    // No refresh token available
    if (isExpired) {
      return null;
    }
  }
  
  return tokens.access_token;
}

/**
 * Get token status
 */
async function getTokenStatus(env) {
  const tokens = await loadTokens(env);
  
  if (!tokens || !tokens.access_token) {
    return {
      has_tokens: false,
      message: 'Not authenticated'
    };
  }
  
  const now = Date.now();
  const isExpired = tokens.expires_at && now >= tokens.expires_at;
  const expiresIn = isExpired ? 0 : Math.floor((tokens.expires_at - now) / 1000);
  const isExpiringSoon = !isExpired && expiresIn < 600; // Less than 10 minutes
  
  return {
    has_tokens: true,
    has_access_token: !!tokens.access_token,
    has_refresh_token: !!tokens.refresh_token,
    is_valid: !isExpired,
    is_expiring_soon: isExpiringSoon,
    expires_in_seconds: expiresIn,
    expires_at: tokens.expires_at,
    obtained_at: tokens.obtained_at,
    last_refresh: tokens.last_refresh,
    refresh_count: tokens.refresh_count || 0,
    access_token_preview: tokens.access_token ? 
      `${tokens.access_token.substring(0, 10)}...` : null
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