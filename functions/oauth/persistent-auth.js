// Cloudflare Worker for persistent StockX authentication
export async function onRequest(context) {
  const { request, env } = context;
  
  try {
    // Only accept POST requests for authentication
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Extract the path to determine the action
    const url = new URL(request.url);
    const path = url.pathname.split('/').pop();
    
    const body = await request.json();
    
    // Handle different actions
    switch (path) {
      case 'setup':
        return await handleSetup(body, env);
      case 'refresh':
        return await handleRefresh(env);
      case 'status':
        return await handleStatus(env);
      case 'token':
        return await handleGetToken(env);
      default:
        return new Response(JSON.stringify({ error: 'Invalid endpoint' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
    }
  } catch (error) {
    console.error('Persistent auth error:', error);
    return new Response(JSON.stringify({ error: `Authentication error: ${error.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Handle setting up the refresh token
async function handleSetup(body, env) {
  try {
    const { refresh_token, access_token, expires_in } = body;
    
    if (!refresh_token) {
      return new Response(JSON.stringify({ error: 'Refresh token is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Calculate expiration time
    const now = Date.now();
    const expiresAt = access_token && expires_in 
      ? now + (expires_in * 1000)
      : now + (3600 * 1000); // Default 1 hour if not provided
    
    // Store the tokens
    const tokenData = {
      refresh_token,
      access_token: access_token || null,
      expires_at: expiresAt,
      obtained_at: now,
      last_refresh: null,
      refresh_count: 0
    };
    
    // Try to store in KV if available
    try {
      if (env.TOKEN_STORE) {
        await env.TOKEN_STORE.put('persistent-tokens', JSON.stringify(tokenData));
      }
    } catch (err) {
      console.warn('Warning: Could not store tokens in KV');
    }
    
    // If we have an access token, validate it
    if (access_token) {
      try {
        const isValid = await validateToken(access_token, env);
        if (!isValid) {
          // Token is invalid, try to refresh immediately
          return await handleRefresh(env);
        }
      } catch (error) {
        // Validation failed, try to refresh
        return await handleRefresh(env);
      }
    } else {
      // No access token provided, try to refresh immediately
      return await handleRefresh(env);
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Refresh token stored successfully',
      access_token: tokenData.access_token,
      expires_at: tokenData.expires_at
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Setup error:', error);
    return new Response(JSON.stringify({ error: `Failed to set up tokens: ${error.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Handle refreshing the token
async function handleRefresh(env) {
  try {
    // Get stored tokens
    let tokenData;
    try {
      if (env.TOKEN_STORE) {
        tokenData = await env.TOKEN_STORE.get('persistent-tokens', { type: 'json' });
      }
    } catch (err) {
      console.warn('Warning: Could not retrieve tokens from KV');
    }
    
    if (!tokenData || !tokenData.refresh_token) {
      return new Response(JSON.stringify({ 
        error: 'No refresh token available',
        message: 'You need to set up refresh token first using /persistent-auth/setup'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Build the token request body
    const tokenRequestData = new URLSearchParams();
    tokenRequestData.append('grant_type', 'refresh_token');
    tokenRequestData.append('client_id', getCredentials(env).client_id);
    tokenRequestData.append('client_secret', getCredentials(env).client_secret);
    tokenRequestData.append('refresh_token', tokenData.refresh_token);
    
    // Make the refresh request
    const response = await fetch('https://accounts.stockx.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: tokenRequestData.toString()
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      
      // If refresh token is invalid, we need to set up again
      if (response.status === 400 && errorText.includes('invalid_grant')) {
        // Clear the stored tokens
        try {
          if (env.TOKEN_STORE) {
            await env.TOKEN_STORE.delete('persistent-tokens');
          }
        } catch (err) {
          console.warn('Warning: Could not clear tokens from KV');
        }
        
        return new Response(JSON.stringify({
          error: 'Refresh token is invalid',
          message: 'Your refresh token has expired. You need to set up a new refresh token.',
          needsSetup: true
        }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      throw new Error(`Token refresh failed: ${errorText}`);
    }
    
    // Parse the response
    const refreshData = await response.json();
    
    // Update the token data
    const updatedTokenData = {
      refresh_token: refreshData.refresh_token || tokenData.refresh_token,
      access_token: refreshData.access_token,
      expires_at: Date.now() + (refreshData.expires_in * 1000),
      obtained_at: tokenData.obtained_at || Date.now(),
      last_refresh: Date.now(),
      refresh_count: (tokenData.refresh_count || 0) + 1
    };
    
    // Store the updated tokens
    try {
      if (env.TOKEN_STORE) {
        await env.TOKEN_STORE.put('persistent-tokens', JSON.stringify(updatedTokenData));
      }
    } catch (err) {
      console.warn('Warning: Could not update tokens in KV');
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Token refreshed successfully',
      access_token: updatedTokenData.access_token,
      expires_at: updatedTokenData.expires_at,
      expires_in: refreshData.expires_in,
      refresh_count: updatedTokenData.refresh_count
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Refresh error:', error);
    return new Response(JSON.stringify({ error: `Failed to refresh token: ${error.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Handle getting token status
async function handleStatus(env) {
  try {
    // Get stored tokens
    let tokenData;
    try {
      if (env.TOKEN_STORE) {
        tokenData = await env.TOKEN_STORE.get('persistent-tokens', { type: 'json' });
      }
    } catch (err) {
      console.warn('Warning: Could not retrieve tokens from KV');
    }
    
    if (!tokenData) {
      return new Response(JSON.stringify({
        has_refresh_token: false,
        has_access_token: false,
        is_valid: false,
        message: 'No tokens available'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Check if access token is valid
    const isExpired = tokenData.expires_at && Date.now() >= tokenData.expires_at;
    const isValid = tokenData.access_token && !isExpired;
    
    // Calculate token info
    const expiresIn = isValid ? Math.floor((tokenData.expires_at - Date.now()) / 1000) : 0;
    const isExpiringSoon = expiresIn < 300; // less than 5 minutes
    
    // If token is expired or expiring soon, trigger a background refresh
    if ((isExpired || isExpiringSoon) && tokenData.refresh_token) {
      // Don't await this, let it run in the background
      handleRefresh(env).catch(err => console.error('Background refresh failed:', err));
    }
    
    return new Response(JSON.stringify({
      has_refresh_token: !!tokenData.refresh_token,
      has_access_token: !!tokenData.access_token,
      is_valid: isValid,
      is_expired: isExpired,
      expires_in_seconds: expiresIn,
      expires_at: tokenData.expires_at,
      obtained_at: tokenData.obtained_at,
      last_refresh: tokenData.last_refresh,
      refresh_count: tokenData.refresh_count || 0,
      current_time: Date.now(),
      auto_refreshing: isExpired || isExpiringSoon
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Status error:', error);
    return new Response(JSON.stringify({ error: `Failed to get token status: ${error.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Handle getting a valid token
async function handleGetToken(env) {
  try {
    // Get stored tokens
    let tokenData;
    try {
      if (env.TOKEN_STORE) {
        tokenData = await env.TOKEN_STORE.get('persistent-tokens', { type: 'json' });
      }
    } catch (err) {
      console.warn('Warning: Could not retrieve tokens from KV');
    }
    
    if (!tokenData || !tokenData.refresh_token) {
      return new Response(JSON.stringify({ 
        error: 'No tokens available',
        message: 'You need to set up tokens first using /persistent-auth/setup'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Check if access token is valid and not expiring soon
    const isExpired = tokenData.expires_at && Date.now() >= tokenData.expires_at;
    const expiresIn = isExpired ? 0 : Math.floor((tokenData.expires_at - Date.now()) / 1000);
    const isExpiringSoon = expiresIn < 300; // less than 5 minutes
    
    // If token is expired or expiring soon, refresh it
    if (isExpired || isExpiringSoon) {
      const refreshResponse = await handleRefresh(env);
      
      if (refreshResponse.status !== 200) {
        return refreshResponse; // Pass through the error
      }
      
      // Get the refreshed token data
      const refreshResult = await refreshResponse.json();
      
      return new Response(JSON.stringify({
        access_token: refreshResult.access_token,
        expires_at: refreshResult.expires_at,
        expires_in: refreshResult.expires_in,
        freshly_refreshed: true
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Token is valid and not expiring soon
    return new Response(JSON.stringify({
      access_token: tokenData.access_token,
      expires_at: tokenData.expires_at,
      expires_in: expiresIn,
      freshly_refreshed: false
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Get token error:', error);
    return new Response(JSON.stringify({ error: `Failed to get token: ${error.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Validate an access token
async function validateToken(token, env) {
  try {
    // Make a test API call
    const response = await fetch('https://gateway.stockx.com/api/customers/me', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'x-api-key': getCredentials(env).client_id
      }
    });
    
    return response.ok;
  } catch (error) {
    console.error('Token validation error:', error);
    return false;
  }
}

// Get credentials
function getCredentials(env) {
  return {
    client_id: env.STOCKX_CLIENT_ID || 'KlbEZjymb9OBap9a3jWlX9bIx4j4y3ks',
    client_secret: env.STOCKX_CLIENT_SECRET || 'y2GqspIoDSgzoryXS3Ue--5i0xlXQUU09F4cqnuVgn6Szk4efqZy1qGip_EVqmqe',
    redirect_uri: env.REDIRECT_URI || 'https://stockx-consignment-portal.pages.dev/callback'
  };
}