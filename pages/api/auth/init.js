import { getAuthorizationUrl } from '../../../server/tokenManager';

/**
 * API route to initialize the OAuth flow
 */
export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the authorization URL and state parameter
    const { authUrl, state } = getAuthorizationUrl();
    
    // Set the state parameter in a cookie for verification
    res.setHeader('Set-Cookie', `oauth-state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1800`);
    
    // Return the authorization URL
    return res.status(200).json({ authUrl });
  } catch (error) {
    console.error('Error initializing OAuth flow:', error);
    return res.status(500).json({ error: 'Failed to initialize OAuth flow' });
  }
}