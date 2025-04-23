import { setDirectBearerToken } from '../../../server/tokenManager';

/**
 * API route to directly set a Bearer token
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get the token from the request body, supporting both JSON and raw text
  let token;
  
  // Check if the content is JSON
  if (req.headers['content-type']?.includes('application/json')) {
    const { token: jsonToken } = req.body;
    token = jsonToken;
  } else {
    // Handle raw text/plain content
    token = req.body;
  }

  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  try {
    // Store the token
    await setDirectBearerToken(token);
    
    // Return success
    return res.status(200).json({ success: true, message: 'Bearer token set successfully' });
  } catch (error) {
    console.error('Error setting Bearer token:', error);
    return res.status(500).json({ error: 'Failed to set Bearer token', details: error.message });
  }
}