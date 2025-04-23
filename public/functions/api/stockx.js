/**
 * API routes for proxying requests to StockX
 */

export async function onRequest(context) {
  const { request, env } = context;
  
  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    return handleCors(request);
  }
  
  // Proxy the request to StockX
  try {
    // Get a valid access token
    const accessToken = await getAccessToken(env);
    
    if (!accessToken) {
      return new Response(JSON.stringify({
        error: 'Not authenticated',
        message: 'No valid access token available. Please authenticate first.'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Extract the StockX API path from the request URL
    const url = new URL(request.url);
    const path = url.pathname;
    const stockxPath = path.replace(/^\/api\/stockx\//, '');
    
    // Build the StockX API URL
    const stockxApiUrl = new URL(stockxPath, 'https://api.stockx.com/');
    
    // Copy query parameters
    url.searchParams.forEach((value, key) => {
      stockxApiUrl.searchParams.append(key, value);
    });
    
    // Clone the request to modify it
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
    
    // Handle unauthorized response (token might be invalid)
    if (response.status === 401) {
      try {
        // Try to refresh the token
        console.log('Received 401, attempting to refresh token');
        const newAccessToken = await refreshAccessToken(env);
        
        // Retry the request with the new token
        stockxReq.headers.set('Authorization', `Bearer ${newAccessToken}`);
        const retryResponse = await fetch(stockxReq);
        
        // Return the response from the retry
        return createCorsResponse(retryResponse);
      } catch (refreshError) {
        console.error('Failed to refresh token on 401:', refreshError);
        
        // Return a 401 response
        return new Response(JSON.stringify({
          error: 'Authentication Error',
          message: 'Your session has expired and could not be refreshed. Please authenticate again.'
        }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // Return the proxy response
    return createCorsResponse(response);
  } catch (error) {
    console.error('API proxy error:', error);
    
    return new Response(JSON.stringify({
      error: 'API Proxy Error',
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
 * Create a response with CORS headers
 */
function createCorsResponse(response) {
  // Create a new response with the original body
  const newResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers)
  });
  
  // Add CORS headers
  newResponse.headers.set('Access-Control-Allow-Origin', '*');
  newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  return newResponse;
}

/**
 * Get a valid access token
 */
async function getAccessToken(env) {
  // Load tokens from KV
  const tokens = await loadTokens(env);
  
  if (!tokens || !tokens.access_token) {
    return null;
  }
  
  // Check if token is expired or will expire soon
  const now = Date.now();
  const isExpired = tokens.expires_at && now >= tokens.expires_at;
  const willExpireSoon = tokens.expires_at && now >= (tokens.expires_at - 60000); // 1 minute buffer
  
  // If token is expired or about to expire, try to refresh
  if (isExpired || willExpireSoon) {
    if (!tokens.refresh_token) {
      return null;
    }
    
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
  
  return tokens.access_token;
}

/**
 * Refresh the access token
 */
async function refreshAccessToken(env) {
  const tokens = await loadTokens(env);
  
  if (!tokens || !tokens.refresh_token) {
    throw new Error('No refresh token available');
  }
  
  const clientId = env.STOCKX_CLIENT_ID;
  const clientSecret = env.STOCKX_CLIENT_SECRET;
  
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