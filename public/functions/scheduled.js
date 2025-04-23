/**
 * Scheduled Worker for Token Refresh
 */

export async function onScheduled(event, env, ctx) {
  try {
    console.log('Running scheduled token refresh');
    
    // Load tokens from KV
    const tokens = await loadTokens(env);
    
    if (!tokens || !tokens.refresh_token) {
      console.log('No tokens found or refresh token missing');
      return;
    }
    
    // Check if token needs refreshing
    const now = Date.now();
    const refreshBuffer = 15 * 60 * 1000; // 15 minutes
    const shouldRefresh = tokens.expires_at && now + refreshBuffer >= tokens.expires_at;
    
    if (!shouldRefresh) {
      console.log('Token is still valid, no need to refresh');
      return;
    }
    
    console.log('Token is expiring soon, refreshing...');
    
    // Refresh the token
    await refreshAccessToken(tokens, env);
    
    console.log('Token refreshed successfully');
  } catch (error) {
    console.error('Error in scheduled refresh:', error);
  }
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
 * Refresh the access token
 */
async function refreshAccessToken(tokens, env) {
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