/**
 * StockX Token Refresher
 * 
 * This script uses a refresh token to get a new access token
 * Usage: node refresh-bearer-token.js "your-refresh-token"
 */

const axios = require('axios');
const fs = require('fs').promises;

// Configuration
const config = {
  clientId: 'KlbEZjymb9OBap9a3jWlX9bIx4j4y3ks',
  clientSecret: 'y2GqspIoDSgzoryXS3Ue--5i0xlXQUU09F4cqnuVgn6Szk4efqZy1qGip_EVqmqe',
  authDomain: 'accounts.stockx.com'
};

// Get refresh token from command line argument
const refreshToken = process.argv[2];

if (!refreshToken) {
  console.error('Error: No refresh token provided');
  console.log('Usage: node refresh-bearer-token.js "your-refresh-token"');
  process.exit(1);
}

// Refresh the token
async function refreshAccessToken(refreshToken) {
  console.log('Refreshing access token...');
  
  try {
    // Build the token request body
    const tokenData = new URLSearchParams();
    tokenData.append('grant_type', 'refresh_token');
    tokenData.append('client_id', config.clientId);
    tokenData.append('client_secret', config.clientSecret);
    tokenData.append('refresh_token', refreshToken);
    
    // Make the token refresh request
    const response = await axios.post(
      `https://${config.authDomain}/oauth/token`,
      tokenData.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    // Add timestamp info
    const tokens = {
      ...response.data,
      obtained_at: Date.now(),
      expires_at: Date.now() + (response.data.expires_in * 1000)
    };
    
    return tokens;
  } catch (error) {
    console.error('Error refreshing token:', error.response?.data || error.message);
    throw new Error('Failed to refresh access token');
  }
}

// Save tokens to file
async function saveTokensToFile(tokens) {
  try {
    await fs.writeFile('oauth-tokens.json', JSON.stringify(tokens, null, 2));
    console.log('Tokens saved to oauth-tokens.json');
  } catch (error) {
    console.error('Error saving tokens:', error.message);
  }
}

// Display token information
function displayTokenInfo(tokens) {
  console.log('\n✅ TOKEN REFRESH COMPLETED SUCCESSFULLY');
  console.log('\n=================== YOUR TOKENS ===================');
  console.log(`Access Token: ${tokens.access_token.substring(0, 20)}...`);
  console.log(`Token Type: ${tokens.token_type}`);
  console.log(`Expires In: ${tokens.expires_in} seconds`);
  console.log(`Expires At: ${new Date(tokens.expires_at).toLocaleString()}`);
  if (tokens.refresh_token) {
    console.log(`\nNew Refresh Token: ${tokens.refresh_token}`);
    console.log('\n🔑 This is your new refresh token. Save it securely!');
  } else {
    console.log(`\nUsing existing Refresh Token: ${refreshToken}`);
  }
  console.log('====================================================');
}

// Main function
async function main() {
  console.log('StockX OAuth2 Token Refresher');
  console.log('============================');
  
  try {
    // Refresh the token
    const tokens = await refreshAccessToken(refreshToken);
    
    // Save tokens to file
    await saveTokensToFile(tokens);
    
    // Display token information
    displayTokenInfo(tokens);
    
    console.log('\n✅ Success! You now have a fresh access token.');
    
    // Show how to use the token
    console.log('\n📝 HOW TO USE YOUR TOKEN WITH THE STOCKX API:');
    console.log('Include these headers in your API requests:');
    console.log(`Authorization: Bearer ${tokens.access_token}`);
    console.log(`x-api-key: OEgPz70FHNL5AxwwK8fJ92Uyk18knTDOdTBxPmi0`);
    
    console.log('\nExample curl command:');
    console.log(`curl --request GET 'https://api.stockx.com/v2/catalog/search?query=nike' \\
--header 'Content-Type: application/json' \\
--header 'Authorization: Bearer ${tokens.access_token}' \\
--header 'x-api-key: OEgPz70FHNL5AxwwK8fJ92Uyk18knTDOdTBxPmi0'`);
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Run the script
main().catch(console.error);