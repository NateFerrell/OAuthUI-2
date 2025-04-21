import { exchangeCodeForTokens } from '../../../server/tokenManager';

/**
 * API route to handle the OAuth callback
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'Authorization code is required' });
  }

  if (!state) {
    return res.status(400).json({ error: 'State parameter is required' });
  }

  // Get the state parameter from the cookie
  const cookieState = req.cookies['oauth-state'];
  
  // Verify the state parameter
  if (state !== cookieState) {
    return res.status(400).json({ error: 'State parameter mismatch' });
  }

  try {
    // Exchange the code for tokens
    const tokens = await exchangeCodeForTokens(code);
    
    // Clear the state cookie
    res.setHeader('Set-Cookie', 'oauth-state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    
    // Return success
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('OAuth callback error:', error);
    return res.status(500).json({ error: 'Failed to exchange authorization code for tokens' });
  }
}