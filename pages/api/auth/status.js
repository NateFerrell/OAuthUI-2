import { getTokenStatus } from '../../../server/tokenManager';

/**
 * API route to check the token status
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the token status
    const status = await getTokenStatus();
    
    // Return the status
    return res.status(200).json(status);
  } catch (error) {
    console.error('Error checking token status:', error);
    return res.status(500).json({ error: 'Failed to check token status' });
  }
}