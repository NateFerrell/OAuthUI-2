// Cloudflare Worker for handling OAuth flow
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.split('/').pop();

  // Determine which handler to use based on the path
  switch (path) {
    case 'init':
      return handleInit(request, env);
    case 'callback':
      return handleCallback(request, env);
    case 'status':
      return handleStatus(request, env);
    case 'test':
      return handleTestRequest(request, env);
    default:
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
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

// Initialize OAuth flow
async function handleInit(request, env) {
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

// Handle OAuth callback
async function handleCallback(request, env) {
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
      expires_at: Date.now() + (tokenResponse.expires_in * 1000)
    };
    
    // Store tokens in KV
    await env.TOKEN_STORE.put('oauth-tokens', JSON.stringify(tokens));

    console.log('Tokens obtained successfully');
    return tokens;
  } catch (error) {
    console.error('Token exchange error:', error);
    throw new Error('Failed to exchange authorization code for tokens');
  }
}

// Get token status
async function handleStatus(request, env) {
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
        obtained_at: null
      };
    }
    
    const isValid = tokensData.expires_at && Date.now() < tokensData.expires_at;
    
    return {
      has_token: !!tokensData.access_token,
      is_valid: isValid,
      expires_in: tokensData.expires_at ? Math.floor((tokensData.expires_at - Date.now()) / 1000) : null,
      obtained_at: tokensData.obtained_at
    };
  } catch (error) {
    console.error('Error getting token status:', error);
    throw new Error('Failed to get token status');
  }
}

// Test the OAuth token with a simple StockX API request
async function handleTestRequest(request, env) {
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
        
        // Update the tokens
        const updatedTokens = {
          access_token: refreshData.access_token,
          refresh_token: refreshData.refresh_token || tokensData.refresh_token,
          expires_in: refreshData.expires_in,
          obtained_at: Date.now(),
          expires_at: Date.now() + (refreshData.expires_in * 1000)
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
        user: profileData
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