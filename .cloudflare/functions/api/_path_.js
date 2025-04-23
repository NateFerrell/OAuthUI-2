// Cloudflare Worker for proxying API requests to StockX with automatic token refresh
export async function onRequest(context) {
  const { request, env, params } = context;
  
  // Extract the path from the URL
  const url = new URL(request.url);
  const pathSegments = url.pathname.replace('/api/', '').split('/');
  const apiPath = pathSegments.join('/');
  
  // Extract query parameters
  const queryString = url.search;
  
  try {
    // Step 1: Get a valid token using the persistent auth system
    const tokenResponse = await fetch(new URL('/oauth/persistent-auth/token', url.origin), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    
    if (!tokenResponse.ok) {
      // Pass through the token error response
      return tokenResponse;
    }
    
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    
    if (!accessToken) {
      return new Response(JSON.stringify({ 
        error: 'Failed to get a valid access token',
        message: 'Please set up persistent authentication first'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Step 2: Make the actual API request with the token
    const apiUrl = `https://api.stockx.com/${apiPath}${queryString}`;
    
    // Clone the original request but modify the headers and URL
    const headers = new Headers(request.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);
    headers.set('x-api-key', getCredentials(env).client_id);
    
    // Remove host header as it would be incorrect for the target API
    headers.delete('host');
    
    const apiRequest = new Request(apiUrl, {
      method: request.method,
      headers: headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.clone().arrayBuffer() : undefined,
      redirect: 'follow'
    });
    
    // Make the request to the StockX API
    const apiResponse = await fetch(apiRequest);
    
    // Clone the response before reading its body
    const clonedResponse = new Response(apiResponse.body, apiResponse);
    
    // Check if the API request was successful
    if (!apiResponse.ok) {
      const errorBody = await apiResponse.text();
      
      // If unauthorized, we may need to refresh the token
      if (apiResponse.status === 401) {
        return new Response(JSON.stringify({
          error: 'API access unauthorized',
          message: 'Your token may be invalid despite being refreshed. Try re-authenticating.',
          details: errorBody
        }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // For other errors, pass through the API response
      return new Response(errorBody, {
        status: apiResponse.status,
        headers: {
          'Content-Type': apiResponse.headers.get('Content-Type') || 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    
    // Success - return the API response
    return new Response(clonedResponse.body, {
      status: clonedResponse.status,
      headers: {
        ...Object.fromEntries(clonedResponse.headers),
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    console.error(`API proxy error: ${error.message}`);
    return new Response(JSON.stringify({ error: `API request failed: ${error.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Handle preflight requests
export function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
      'Access-Control-Max-Age': '86400'
    }
  });
}

// StockX OAuth credentials
function getCredentials(env) {
  return {
    client_id: env.STOCKX_CLIENT_ID || 'KlbEZjymb9OBap9a3jWlX9bIx4j4y3ks',
    client_secret: env.STOCKX_CLIENT_SECRET || 'y2GqspIoDSgzoryXS3Ue--5i0xlXQUU09F4cqnuVgn6Szk4efqZy1qGip_EVqmqe',
    redirect_uri: env.REDIRECT_URI || 'https://stockx-consignment-portal.pages.dev/callback'
  };
}