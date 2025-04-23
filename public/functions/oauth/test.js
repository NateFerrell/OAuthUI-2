// Cloudflare Worker for testing the OAuth token
export async function onRequest(context) {
  const { request, env } = context;
  
  try {
    // Get the current access token, refreshing if necessary
    const tokensData = await env.TOKEN_STORE.get('oauth-tokens', { type: 'json' });
    
    if (!tokensData || !tokensData.access_token) {
      return new Response(JSON.stringify({ error: 'No access token available' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Check if token is expired
    const isExpired = tokensData.expires_at && Date.now() >= tokensData.expires_at;
    
    // If token is expired, try to refresh
    if (isExpired && tokensData.refresh_token) {
      try {
        // Refresh the token
        const tokenData = new URLSearchParams();
        tokenData.append('grant_type', 'refresh_token');
        tokenData.append('client_id', getCredentials(env).client_id);
        tokenData.append('client_secret', getCredentials(env).client_secret);
        tokenData.append('refresh_token', tokensData.refresh_token);
    
        // Make the token refresh request
        const response = await fetch('https://accounts.stockx.com/oauth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: tokenData.toString()
        });
    
        if (!response.ok) {
          throw new Error(`Failed to refresh token: ${await response.text()}`);
        }
    
        const refreshData = await response.json();
        
        // Store the current token as previous token for tracking refresh history
        await env.TOKEN_STORE.put('previous_access_token', tokensData.access_token);
        
        // Update the tokens
        const updatedTokens = {
          access_token: refreshData.access_token,
          refresh_token: refreshData.refresh_token || tokensData.refresh_token,
          expires_in: refreshData.expires_in,
          obtained_at: Date.now(),
          first_obtained_at: tokensData.first_obtained_at || Date.now(),
          expires_at: Date.now() + (refreshData.expires_in * 1000),
          last_refresh: Date.now(),
          refresh_count: (tokensData.refresh_count || 0) + 1
        };
        
        // Store updated tokens
        await env.TOKEN_STORE.put('oauth-tokens', JSON.stringify(updatedTokens));
        
        // Use the new access token
        tokensData.access_token = updatedTokens.access_token;
      } catch (error) {
        return new Response(JSON.stringify({ error: `Failed to refresh token: ${error.message}` }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // Make a test request to the StockX API
    try {
      // Try to get the user profile as a simple test
      const profileResponse = await fetch('https://gateway.stockx.com/api/customers/me', {
        headers: {
          'Authorization': `Bearer ${tokensData.access_token}`,
          'x-api-key': getCredentials(env).client_id
        }
      });
      
      if (!profileResponse.ok) {
        return new Response(JSON.stringify({ 
          error: 'API request failed', 
          status: profileResponse.status,
          details: await profileResponse.text()
        }), {
          status: profileResponse.status,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const profileData = await profileResponse.json();
      
      return new Response(JSON.stringify({
        success: true,
        message: 'OAuth token is working correctly',
        user: profileData,
        timestamp: Date.now(),
        token_obtained_at: tokensData.obtained_at,
        token_expires_at: tokensData.expires_at,
        token_expires_in_seconds: tokensData.expires_at ? Math.floor((tokensData.expires_at - Date.now()) / 1000) : null,
        recently_refreshed: tokensData.access_token !== (await env.TOKEN_STORE.get('previous_access_token'))
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: `API request error: ${error.message}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: `Test request error: ${error.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// StockX OAuth credentials
function getCredentials(env) {
  return {
    client_id: env.STOCKX_CLIENT_ID || 'KlbEZjymb9OBap9a3jWlX9bIx4j4y3ks',
    client_secret: env.STOCKX_CLIENT_SECRET || 'y2GqspIoDSgzoryXS3Ue--5i0xlXQUU09F4cqnuVgn6Szk4efqZy1qGip_EVqmqe',
    redirect_uri: env.REDIRECT_URI || 'https://stockx-consignment-portal.pages.dev/callback'
  };
}