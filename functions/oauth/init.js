// Cloudflare Worker for initializing OAuth flow
export async function onRequest(context) {
  const { request, env } = context;
  
  try {
    // Generate a random state parameter for security
    const state = crypto.randomUUID();
    
    // Get credentials
    const credentials = getCredentials(env);
    
    // Build the authorization URL
    const authUrl = `https://accounts.stockx.com/authorize?` +
      `response_type=code&` +
      `client_id=${credentials.client_id}&` +
      `redirect_uri=${credentials.redirect_uri}&` +
      `scope=offline_access openid&` +
      `audience=gateway.stockx.com&` +
      `state=${state}`;
    
    // Set the state parameter in a cookie for verification
    const headers = new Headers();
    headers.append('Content-Type', 'application/json');
    headers.append('Set-Cookie', `oauth-state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1800`);
    
    return new Response(JSON.stringify({ authUrl }), {
      status: 200,
      headers
    });
  } catch (error) {
    console.error('Error initializing OAuth flow:', error);
    return new Response(JSON.stringify({ error: 'Failed to initialize OAuth flow' }), {
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