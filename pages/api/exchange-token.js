import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, redirect_uri } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'Authorization code is required' });
  }

  try {
    // Build the token request body
    const tokenData = new URLSearchParams();
    tokenData.append('grant_type', 'authorization_code');
    tokenData.append('client_id', 'KlbEZjymb9OBap9a3jWlX9bIx4j4y3ks');
    tokenData.append('client_secret', 'y2GqspIoDSgzoryXS3Ue--5i0xlXQUU09F4cqnuVgn6Szk4efqZy1qGip_EVqmqe');
    tokenData.append('code', code);
    tokenData.append('redirect_uri', redirect_uri);

    // Make the token exchange request
    const response = await axios.post(
      'https://accounts.stockx.com/oauth/token',
      tokenData.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    // Return the tokens
    return res.status(200).json(response.data);
  } catch (error) {
    console.error('Token exchange error:', error.response?.data || error.message);
    
    return res.status(error.response?.status || 500).json({
      error: error.response?.data?.error_description || 
             error.response?.data?.error || 
             'Failed to exchange authorization code for tokens'
    });
  }
}