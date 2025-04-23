// Cloudflare Worker for checking token status
export async function onRequest(context) {
  const { request, env } = context;
  
  try {
    // Get the token status
    const status = await getTokenStatus(env);
    
    return new Response(JSON.stringify(status), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error checking token status:', error);
    return new Response(JSON.stringify({ error: 'Failed to check token status' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Get token status
async function getTokenStatus(env) {
  try {
    // Get the current tokens from KV
    const tokensData = await env.TOKEN_STORE.get('oauth-tokens', { type: 'json' });
    
    if (!tokensData) {
      return {
        has_token: false,
        is_valid: false,
        expires_in: null,
        obtained_at: null,
        current_time: Date.now()
      };
    }
    
    const isValid = tokensData.expires_at && Date.now() < tokensData.expires_at;
    
    return {
      has_token: !!tokensData.access_token,
      is_valid: isValid,
      expires_in: tokensData.expires_at ? Math.floor((tokensData.expires_at - Date.now()) / 1000) : null,
      obtained_at: tokensData.obtained_at,
      first_obtained_at: tokensData.first_obtained_at,
      last_refresh: tokensData.last_refresh,
      refresh_count: tokensData.refresh_count || 0,
      current_time: Date.now(),
      token_age_hours: tokensData.first_obtained_at ? 
        Math.round((Date.now() - tokensData.first_obtained_at) / (1000 * 60 * 60) * 10) / 10 : null
    };
  } catch (error) {
    console.error('Error getting token status:', error);
    throw new Error('Failed to get token status');
  }
}