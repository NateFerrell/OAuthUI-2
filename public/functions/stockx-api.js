/**
 * Cloudflare Worker for StockX API proxy
 * 
 * This worker:
 * 1. Gets a valid access token using the token manager
 * 2. Proxies requests to the StockX API with the token
 * 3. Handles token refresh if needed
 */

import { getTokenManager } from './token-manager';

export async function onRequest(context) {
  const { request, env } = context;
  
  try {
    // Initialize token manager
    const tokenManager = await getTokenManager(env);
    
    // Get a valid access token
    const accessToken = await tokenManager.getAccessToken();
    
    if (!accessToken) {
      return new Response(JSON.stringify({
        error: 'Not authenticated',
        message: 'No valid access token available. Please authenticate first.'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Extract the StockX API path from the request URL
    const url = new URL(request.url);
    const stockxPath = url.pathname.replace(/^\/api\/stockx\//, '');
    
    // Build the StockX API URL
    const stockxApiUrl = new URL(stockxPath, 'https://api.stockx.com/');
    
    // Copy query parameters
    url.searchParams.forEach((value, key) => {
      stockxApiUrl.searchParams.append(key, value);
    });
    
    // Clone the request to modify it
    const stockxReq = new Request(stockxApiUrl, {
      method: request.method,
      headers: new Headers(request.headers),
      body: ['GET', 'HEAD'].includes(request.method) ? null : await request.clone().arrayBuffer(),
      redirect: 'follow'
    });
    
    // Add StockX authentication headers
    stockxReq.headers.set('Authorization', `Bearer ${accessToken}`);
    stockxReq.headers.set('x-api-key', env.STOCKX_API_KEY || 'OEgPz70FHNL5AxwwK8fJ92Uyk18knTDOdTBxPmi0');
    stockxReq.headers.set('Content-Type', 'application/json');
    
    // Forward the request to StockX API
    const response = await fetch(stockxReq);
    
    // Handle unauthorized response (token might be invalid)
    if (response.status === 401) {
      try {
        // Try to refresh the token
        console.log('Received 401, attempting to refresh token');
        await tokenManager.refreshAccessToken();
        
        // Get new access token
        const newAccessToken = await tokenManager.getAccessToken();
        
        // Retry the request with the new token
        stockxReq.headers.set('Authorization', `Bearer ${newAccessToken}`);
        const retryResponse = await fetch(stockxReq);
        
        // Return the response from the retry
        return rewriteResponse(retryResponse, url.origin);
      } catch (refreshError) {
        console.error('Failed to refresh token on 401:', refreshError);
        
        // Return the original 401 response
        return rewriteResponse(response, url.origin);
      }
    }
    
    // Return the proxy response
    return rewriteResponse(response, url.origin);
  } catch (error) {
    console.error('StockX API proxy error:', error);
    
    return new Response(JSON.stringify({
      error: 'API Proxy Error',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Rewrite the response to handle CORS and other adjustments
 */
function rewriteResponse(response, origin) {
  // Create a new response with the original body
  const newResponse = new Response(response.body, response);
  
  // Add CORS headers
  newResponse.headers.set('Access-Control-Allow-Origin', origin);
  newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Remove headers that might cause issues
  newResponse.headers.delete('set-cookie');
  
  return newResponse;
}