// Cloudflare Worker for directly getting a token from StockX
export async function onRequest(context) {
  const { request, env } = context;
  
  try {
    // Only accept POST requests with token data
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Get token from request body
    const reqData = await request.json();
    const { token } = reqData;
    
    if (!token) {
      return new Response(JSON.stringify({ error: 'Token is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Create tokens object
    const tokens = {
      access_token: token,
      obtained_at: Date.now(),
      first_obtained_at: Date.now(),
      expires_at: Date.now() + (86400 * 1000), // assume 24 hours validity to start
      refresh_count: 0
    };
    
    // Try to store the token in KV if available
    try {
      if (env.TOKEN_STORE) {
        await env.TOKEN_STORE.put('oauth-tokens', JSON.stringify(tokens));
        await env.TOKEN_STORE.put('previous_access_token', token);
      }
    } catch (err) {
      console.warn('KV storage not available, token not persisted server-side');
    }
    
    // Test the token with a simple API call
    try {
      // Try to get the user profile
      const profileResponse = await fetch('https://gateway.stockx.com/api/customers/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-api-key': 'OEgPz70FHNL5AxwwK8fJ92Uyk18knTDOdTBxPmi0'
        }
      });
      
      if (!profileResponse.ok) {
        return new Response(JSON.stringify({ 
          error: 'Token validation failed',
          status: profileResponse.status,
          details: await profileResponse.text()
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const profileData = await profileResponse.json();
      
      return new Response(JSON.stringify({
        success: true,
        message: 'Token stored and validated successfully',
        user: profileData,
        token_info: {
          first_chars: token.substring(0, 10) + '...',
          obtained_at: new Date(tokens.obtained_at).toISOString(),
          expires_estimated: new Date(tokens.expires_at).toISOString()
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: `Token validation error: ${error.message}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    console.error('Error storing direct token:', error);
    return new Response(JSON.stringify({ error: `Failed to process token: ${error.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}