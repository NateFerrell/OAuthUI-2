// Cloudflare Worker for storing authentication cookies
export async function onRequest(context) {
  const { request, env } = context;
  
  try {
    // Only accept POST requests with cookies
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Get the cookies from the request
    const reqData = await request.json();
    const { cookies, description } = reqData;
    
    if (!cookies) {
      return new Response(JSON.stringify({ error: 'Cookies are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Store the cookies in KV store
    const cookieData = {
      cookies,
      description: description || 'Stored on ' + new Date().toLocaleString(),
      stored_at: Date.now()
    };
    
    // Generate a unique ID for this cookie set
    const cookieId = crypto.randomUUID();
    
    // Store in KV
    await env.TOKEN_STORE.put(`cookies-${cookieId}`, JSON.stringify(cookieData));
    
    // Also store as the current default cookies
    await env.TOKEN_STORE.put('current-auth-cookies', JSON.stringify(cookieData));
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Authentication cookies stored successfully',
      cookie_id: cookieId
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error storing cookies:', error);
    return new Response(JSON.stringify({ error: `Failed to store cookies: ${error.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}