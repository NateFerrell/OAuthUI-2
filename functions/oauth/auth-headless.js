// Cloudflare Worker for headless authentication using stored credentials
export async function onRequest(context) {
  const { request, env } = context;
  
  try {
    // Only accept POST requests with credentials
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Get request data (either cookies, stored cookies flag, or username/password)
    const reqData = await request.json();
    const { cookies, username, password, use_stored_cookies } = reqData;
    
    // Check if we should use stored cookies from KV
    let cookieString = cookies;
    if (use_stored_cookies) {
      const storedCookies = await env.TOKEN_STORE.get('current-auth-cookies', { type: 'json' });
      if (!storedCookies || !storedCookies.cookies) {
        return new Response(JSON.stringify({ 
          error: 'No stored cookies found. Please use the cookie capture tool first.' 
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      cookieString = storedCookies.cookies;
    }
    
    if (!cookieString && (!username || !password) && !use_stored_cookies) {
      return new Response(JSON.stringify({ 
        error: 'Either authentication cookies, stored cookies flag, or username/password are required' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Generate state parameter
    const state = crypto.randomUUID();
    
    // Get credentials
    const credentials = getCredentials(env);
    
    // Store the state parameter in KV for later verification
    // Skip this step if KV storage is not available
    try {
      if (env.TOKEN_STORE) {
        await env.TOKEN_STORE.put('headless-oauth-state', state, { expirationTtl: 1800 });
      }
    } catch (err) {
      console.warn('KV storage not available, proceeding without storing state');
    }
    
    // First approach: If cookies are provided or stored, use them directly
    if (cookieString) {
      return await authenticateWithCookies(cookieString, state, credentials, env);
    }
    
    // Second approach: If username/password are provided, simulate login
    if (username && password) {
      return await authenticateWithCredentials(username, password, state, credentials, env);
    }
    
    // This should never happen due to the earlier check
    return new Response(JSON.stringify({ error: 'Authentication method not supported' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Headless auth error:', error);
    return new Response(JSON.stringify({ error: `Authentication failed: ${error.message}` }), {
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

// Authenticate using provided cookies
async function authenticateWithCookies(cookies, state, credentials, env) {
  try {
    // Construct the auth URL with the state parameter
    const authUrl = `https://accounts.stockx.com/authorize?` +
      `response_type=code&` +
      `client_id=${credentials.client_id}&` +
      `redirect_uri=${credentials.redirect_uri}&` +
      `scope=offline_access openid&` +
      `audience=gateway.stockx.com&` +
      `state=${state}`;
    
    // Clean up the cookie string to ensure it's valid
    // Remove any trailing semicolons and ensure proper spacing
    let cleanedCookies = cookies.trim();
    cleanedCookies = cleanedCookies.replace(/;\s*$/, ''); // Remove trailing semicolons
    cleanedCookies = cleanedCookies.replace(/;\s*;/g, ';'); // Remove double semicolons
    cleanedCookies = cleanedCookies.replace(/;\s*/g, '; '); // Ensure proper spacing after semicolons
    
    console.log('Making auth request with cleaned cookies');
    
    // Make request to authorization endpoint with cookies
    const authResponse = await fetch(authUrl, {
      headers: {
        'Cookie': cleanedCookies,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive'
      },
      redirect: 'manual' // Don't follow redirects
    });
    
    // Check if we got a redirect (success) or HTML (need to login)
    if (authResponse.status === 302) {
      // Get the location header (redirect URL)
      const location = authResponse.headers.get('location');
      
      if (!location) {
        throw new Error('No redirect location found');
      }
      
      // Extract the code from the redirect URL
      const redirectUrl = new URL(location);
      const code = redirectUrl.searchParams.get('code');
      const returnedState = redirectUrl.searchParams.get('state');
      
      // Verify state parameter
      if (returnedState !== state) {
        throw new Error('State parameter mismatch');
      }
      
      if (!code) {
        throw new Error('No authorization code found in redirect');
      }
      
      // Exchange the authorization code for tokens
      const tokens = await exchangeCodeForTokens(code, env);
      
      return new Response(JSON.stringify({
        success: true,
        message: 'Headless authentication successful',
        tokens
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      // We got HTML content, indicating we need to login
      const htmlContent = await authResponse.text();
      console.log('Auth response status:', authResponse.status);
      console.log('Response headers:', JSON.stringify(Object.fromEntries([...authResponse.headers.entries()])));
      
      // Check if it's a login page
      if (htmlContent.includes('login') || htmlContent.includes('sign in')) {
        return new Response(JSON.stringify({
          error: 'Authentication cookies are expired or invalid',
          needsLogin: true,
          status: authResponse.status,
          statusText: authResponse.statusText
        }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        // Preview of the response for debugging
        const previewHtml = htmlContent.slice(0, 500) + '...';
        
        // Some other error occurred
        return new Response(JSON.stringify({
          error: 'Unexpected response from authorization server',
          status: authResponse.status,
          statusText: authResponse.statusText,
          previewHtml
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
  } catch (error) {
    console.error('Cookie authentication error:', error);
    throw new Error(`Cookie authentication failed: ${error.message}`);
  }
}

// Authenticate with username and password
async function authenticateWithCredentials(username, password, state, credentials, env) {
  try {
    // Note: Direct username/password authentication is generally not recommended
    // and might violate terms of service. This implementation is for educational purposes.
    
    // First, get the login page to extract CSRF token and cookies
    const loginPageResponse = await fetch('https://accounts.stockx.com/login', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36'
      }
    });
    
    // Get cookies from login page
    const cookies = loginPageResponse.headers.get('set-cookie');
    const loginPageHtml = await loginPageResponse.text();
    
    // Extract CSRF token from HTML (this is a simplified example)
    const csrfMatch = loginPageHtml.match(/name="csrf_token"[^>]*value="([^"]+)"/);
    const csrfToken = csrfMatch ? csrfMatch[1] : '';
    
    if (!csrfToken) {
      throw new Error('Could not extract CSRF token from login page');
    }
    
    // Perform login request
    const loginResponse = await fetch('https://accounts.stockx.com/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({
        username: username,
        password: password,
        csrf_token: csrfToken
      })
    });
    
    // Check if login was successful
    if (loginResponse.status !== 200 && loginResponse.status !== 302) {
      throw new Error(`Login failed with status ${loginResponse.status}`);
    }
    
    // Get authentication cookies from login response
    const authCookies = loginResponse.headers.get('set-cookie');
    
    // Use these cookies to complete the OAuth flow
    return await authenticateWithCookies(authCookies, state, credentials, env);
  } catch (error) {
    console.error('Credential authentication error:', error);
    throw new Error(`Credential authentication failed: ${error.message}`);
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
      first_obtained_at: Date.now(),
      expires_at: Date.now() + (tokenResponse.expires_in * 1000),
      refresh_count: 0
    };
    
    // Try to store tokens in KV if available
    try {
      if (env.TOKEN_STORE) {
        await env.TOKEN_STORE.put('oauth-tokens', JSON.stringify(tokens));
        await env.TOKEN_STORE.put('previous_access_token', tokens.access_token);
      }
    } catch (err) {
      console.warn('KV storage not available, tokens not persisted server-side');
    }

    console.log('Tokens obtained successfully');
    return tokens;
  } catch (error) {
    console.error('Token exchange error:', error);
    throw new Error('Failed to exchange authorization code for tokens');
  }
}