/**
 * Cloudflare Worker for refreshing StockX OAuth tokens
 * 
 * This Worker runs on a schedule to refresh tokens before they expire.
 * It uses Cloudflare KV for token storage.
 */

export default {
  async scheduled(event, env, ctx) {
    console.log('Running scheduled token refresh');
    
    try {
      // Get the current tokens from KV
      const tokensData = await env.TOKEN_STORE.get('oauth-tokens', { type: 'json' });
      
      if (!tokensData || !tokensData.refresh_token) {
        console.log('No tokens found or refresh token missing');
        return;
      }
      
      // Check if the token is about to expire (within 15 minutes)
      const now = Date.now();
      const tokenExpiresAt = tokensData.obtained_at + (tokensData.expires_in * 1000);
      
      if (now + 15 * 60 * 1000 < tokenExpiresAt) {
        console.log('Token is still valid, no need to refresh');
        return;
      }
      
      console.log('Token is about to expire, refreshing...');
      
      // Refresh the token
      const refreshedTokens = await refreshToken(tokensData.refresh_token, env);
      
      // Update the token in KV
      await env.TOKEN_STORE.put('oauth-tokens', JSON.stringify({
        ...refreshedTokens,
        obtained_at: Date.now(),
      }));
      
      console.log('Token refreshed successfully');
    } catch (error) {
      console.error('Error refreshing token:', error);
    }
  }
};

/**
 * Refresh the access token using the refresh token
 * @param {string} refreshToken - The refresh token
 * @param {object} env - The environment with secrets
 * @returns {Promise<object>} The new tokens
 */
async function refreshToken(refreshToken, env) {
  // StockX OAuth credentials (would be in env vars)
  const CLIENT_ID = env.STOCKX_CLIENT_ID || 'KlbEZjymb9OBap9a3jWlX9bIx4j4y3ks';
  const CLIENT_SECRET = env.STOCKX_CLIENT_SECRET || 'y2GqspIoDSgzoryXS3Ue--5i0xlXQUU09F4cqnuVgn6Szk4efqZy1qGip_EVqmqe';
  
  // Build the token request body
  const tokenData = new URLSearchParams();
  tokenData.append('grant_type', 'refresh_token');
  tokenData.append('client_id', CLIENT_ID);
  tokenData.append('client_secret', CLIENT_SECRET);
  tokenData.append('refresh_token', refreshToken);

  // Make the token refresh request
  const response = await fetch('https://accounts.stockx.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: tokenData.toString()
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }
  
  return response.json();
}