/**
 * Cloudflare Worker for StockX OAuth Authentication API endpoints
 */

import { getTokenManager } from './token-manager';

// Map of in-progress authorization states
const stateStore = new Map();

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;
  
  // Initialize the token manager
  const tokenManager = await getTokenManager(env);
  
  // Handle different auth endpoints
  if (pathname.endsWith('/status')) {
    return handleStatus(tokenManager, request);
  } else if (pathname.endsWith('/init')) {
    return handleInit(tokenManager, request);
  } else if (pathname.endsWith('/callback')) {
    return handleCallback(tokenManager, request);
  } else if (pathname.endsWith('/clear')) {
    return handleClear(tokenManager, request);
  }
  
  // Return 404 for unknown paths
  return new Response('Not Found', { status: 404 });
}

/**
 * Handle status check requests
 */
async function handleStatus(tokenManager, request) {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  
  try {
    const status = await tokenManager.getTokenStatus();
    return new Response(JSON.stringify(status), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error getting status:', error);
    return new Response(JSON.stringify({ error: 'Failed to get status' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle auth initialization requests
 */
async function handleInit(tokenManager, request) {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  
  try {
    const { authUrl, state } = tokenManager.getAuthorizationUrl();
    
    // Store state for verification
    stateStore.set(state, { created: Date.now() });
    
    return new Response(JSON.stringify({ authUrl, state }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error initializing auth:', error);
    return new Response(JSON.stringify({ error: 'Failed to initialize auth' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle callback API requests (code exchange)
 */
async function handleCallback(tokenManager, request) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  
  try {
    const data = await request.json();
    const { code, state } = data;
    
    if (!code) {
      return new Response(JSON.stringify({ error: 'Missing code parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Verify state if provided
    if (state && !stateStore.has(state)) {
      return new Response(JSON.stringify({ error: 'Invalid state parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Clean up state
    if (state) {
      stateStore.delete(state);
    }
    
    // Exchange code for tokens
    await tokenManager.exchangeCodeForTokens(code);
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error handling callback:', error);
    return new Response(JSON.stringify({ error: 'Failed to exchange code for tokens' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle token clear requests
 */
async function handleClear(tokenManager, request) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  
  try {
    await tokenManager.clearTokens();
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error clearing tokens:', error);
    return new Response(JSON.stringify({ error: 'Failed to clear tokens' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}