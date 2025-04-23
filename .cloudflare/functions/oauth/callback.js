// Cloudflare Worker for handling OAuth callback
export async function onRequest(context) {
  const { request, env } = context;
  
  try {
    // Accept both POST for API calls and GET for direct StockX redirects
    if (request.method === 'POST') {
      // Handle POST request from our frontend
      const reqData = await request.json();
      const { code, state } = reqData;

      if (!code) {
        return new Response(JSON.stringify({ error: 'Authorization code is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (!state) {
        return new Response(JSON.stringify({ error: 'State parameter is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Get the state parameter from the cookie
      const cookies = request.headers.get('Cookie') || '';
      const cookieState = cookies.split(';')
        .map(cookie => cookie.trim())
        .find(cookie => cookie.startsWith('oauth-state='));
      
      const cookieStateValue = cookieState?.split('=')[1];
      
      // Verify the state parameter
      if (state !== cookieStateValue) {
        return new Response(JSON.stringify({ error: 'State parameter mismatch' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Exchange the code for tokens
      const tokens = await exchangeCodeForTokens(code, env);
      
      // Clear the state cookie
      const headers = new Headers();
      headers.append('Content-Type', 'application/json');
      headers.append('Set-Cookie', 'oauth-state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
      
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers
      });
    } else if (request.method === 'GET') {
      // This is a direct callback from StockX OAuth
      // We'll redirect to our callback page with the parameters intact
      const url = new URL(request.url);
      return Response.redirect(`/callback${url.search}`, 302);
    } else {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    console.error('OAuth callback error:', error);
    return new Response(JSON.stringify({ error: 'Failed to exchange authorization code for tokens' }), {
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

// Exchange an authorization code for access and refresh tokens
async function exchangeCodeForTokens(code, env) {
  try {
    const credentials = getCredentials(env);
    
    // Build the token request body
    const tokenData = new URLSearchParams();
    tokenData.append('grant_type', 'authorization_code');
    tokenData.append('client_id', credentials.client_id);
    tokenData.append('client_secret', credentials.client_secret);
    tokenData.append('code', code);
    tokenData.append('redirect_uri', credentials.redirect_uri);

    // Make the token exchange request
    const response = await fetch('https://accounts.stockx.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: tokenData.toString()
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange code for tokens: ${error}`);
    }

    const tokenResponse = await response.json();

    // Store the tokens
    const tokens = {
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token,
      expires_in: tokenResponse.expires_in,
      obtained_at: Date.now(),
      first_obtained_at: Date.now(),
      expires_at: Date.now() + (tokenResponse.expires_in * 1000),
      refresh_count: 0
    };
    
    // Store tokens in KV
    await env.TOKEN_STORE.put('oauth-tokens', JSON.stringify(tokens));
    
    // Store initial access token for comparison
    await env.TOKEN_STORE.put('previous_access_token', tokens.access_token);

    console.log('Tokens obtained successfully');
    return tokens;
  } catch (error) {
    console.error('Token exchange error:', error);
    throw new Error('Failed to exchange authorization code for tokens');
  }
}