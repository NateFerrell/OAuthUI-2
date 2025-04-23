// Cloudflare Worker for getting a valid access token
export async function onRequest(context) {
  const { request, env } = context;
  
  try {
    // Only allow GET requests for tokens
    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Get token data from KV store
    const tokensData = await env.TOKEN_STORE.get('oauth-tokens', { type: 'json' });
    
    if (!tokensData || !tokensData.access_token) {
      return new Response(JSON.stringify({ 
        error: 'No access token available',
        message: 'Please authenticate first using the /oauth/auth-headless endpoint'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Check if token is expired or about to expire (within 5 minutes)
    const isExpiring = tokensData.expires_at && Date.now() >= (tokensData.expires_at - 5 * 60 * 1000);
    
    // If token is expired or about to expire, try to refresh
    if (isExpiring && tokensData.refresh_token) {
      try {
        console.log('Token is expiring soon, refreshing...');
        
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
          const errorText = await response.text();
          console.error('Token refresh failed:', errorText);
          
          // If refresh token is expired, we need to re-authenticate
          if (response.status === 400 && errorText.includes('invalid_grant')) {
            return new Response(JSON.stringify({ 
              error: 'Refresh token expired',
              message: 'Your refresh token has expired. Please authenticate again using the /oauth/auth-headless endpoint',
              needsReauth: true
            }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          
          throw new Error(`Failed to refresh token: ${errorText}`);
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
        console.log('Token refreshed successfully');
        
        // Return the new tokens
        return new Response(JSON.stringify({
          success: true,
          message: 'Token refreshed successfully',
          access_token: updatedTokens.access_token,
          expires_at: updatedTokens.expires_at,
          expires_in_seconds: Math.floor((updatedTokens.expires_at - Date.now()) / 1000),
          refresh_count: updatedTokens.refresh_count,
          last_refresh: new Date(updatedTokens.last_refresh).toISOString()
        }), {
          status: 200,
          headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, private'
          }
        });
      } catch (error) {
        console.error('Token refresh error:', error);
        return new Response(JSON.stringify({ 
          error: `Failed to refresh token: ${error.message}`,
          message: 'Please try again or re-authenticate' 
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // If token is still valid, return it
    return new Response(JSON.stringify({
      success: true,
      access_token: tokensData.access_token,
      expires_at: tokensData.expires_at,
      expires_in_seconds: Math.floor((tokensData.expires_at - Date.now()) / 1000),
      refresh_count: tokensData.refresh_count || 0,
      first_obtained_at: new Date(tokensData.first_obtained_at).toISOString(),
      last_refresh: tokensData.last_refresh ? new Date(tokensData.last_refresh).toISOString() : null
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, private'
      }
    });
  } catch (error) {
    console.error('Error getting token:', error);
    return new Response(JSON.stringify({ error: `Failed to get token: ${error.message}` }), {
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