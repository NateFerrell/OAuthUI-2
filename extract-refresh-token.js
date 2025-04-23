/**
 * StockX Token Extractor
 * 
 * This script extracts refresh tokens from a proper OAuth flow
 * It performs the authorization code flow to get a refresh token
 */

const axios = require('axios');
const fs = require('fs').promises;
const readline = require('readline');
const { URL, URLSearchParams } = require('url');
const open = require('open'); // You may need to install this: npm install open

// Configuration
const config = {
  clientId: 'KlbEZjymb9OBap9a3jWlX9bIx4j4y3ks',
  clientSecret: 'y2GqspIoDSgzoryXS3Ue--5i0xlXQUU09F4cqnuVgn6Szk4efqZy1qGip_EVqmqe',
  redirectUri: 'http://localhost:3000/callback',
  authDomain: 'accounts.stockx.com',
  audience: 'gateway.stockx.com',
  scope: 'offline_access openid'
};

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Prompt for input
function prompt(question) {
  return new Promise(resolve => {
    rl.question(question, answer => {
      resolve(answer);
    });
  });
}

// Generate a random state parameter
function generateRandomState() {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

// Step 1: Get authorization URL
function getAuthorizationUrl() {
  const state = generateRandomState();
  
  const authUrl = new URL(`https://${config.authDomain}/authorize`);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('client_id', config.clientId);
  authUrl.searchParams.append('redirect_uri', config.redirectUri);
  authUrl.searchParams.append('scope', config.scope);
  authUrl.searchParams.append('audience', config.audience);
  authUrl.searchParams.append('state', state);
  
  return { authUrl: authUrl.toString(), state };
}

// Step 2: Exchange code for tokens
async function exchangeCodeForTokens(code) {
  console.log('Exchanging code for tokens...');
  
  const tokenData = new URLSearchParams();
  tokenData.append('grant_type', 'authorization_code');
  tokenData.append('client_id', config.clientId);
  tokenData.append('client_secret', config.clientSecret);
  tokenData.append('code', code);
  tokenData.append('redirect_uri', config.redirectUri);
  
  try {
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
    console.error('Error exchanging code for tokens:', error.response?.data || error.message);
    throw new Error('Failed to exchange code for tokens');
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

// Extract code from callback URL
function extractCodeFromUrl(redirectUrl) {
  try {
    const url = new URL(redirectUrl);
    return {
      code: url.searchParams.get('code'),
      state: url.searchParams.get('state')
    };
  } catch (error) {
    console.error('Error parsing URL:', error.message);
    return { code: null, state: null };
  }
}

// Display token information
function displayTokenInfo(tokens) {
  console.log('\n✅ OAUTH2 FLOW COMPLETED SUCCESSFULLY');
  console.log('\n=================== YOUR TOKENS ===================');
  console.log(`Access Token: ${tokens.access_token.substring(0, 20)}...`);
  console.log(`Token Type: ${tokens.token_type}`);
  console.log(`Expires In: ${tokens.expires_in} seconds`);
  if (tokens.refresh_token) {
    console.log(`\nRefresh Token: ${tokens.refresh_token}`);
    console.log('\n🔑 This is your refresh token. Save it securely!');
  } else {
    console.log('\n⚠️ No refresh token received. Make sure you requested offline_access scope.');
  }
  console.log('====================================================');
}

// Main function
async function main() {
  console.log('StockX OAuth2 Refresh Token Extractor');
  console.log('====================================');
  
  try {
    console.log('\nStarting OAuth2 flow to get a refresh token...');
    
    // Step 1: Get authorization URL
    const { authUrl, state } = getAuthorizationUrl();
    console.log(`\nAuthorization URL: ${authUrl}`);
    
    // Open the browser
    console.log('\nOpening your browser to complete authentication...');
    await open(authUrl);
    
    // Get the callback URL from user
    console.log('\n1. Log in to StockX in your browser');
    console.log('2. After logging in, you will be redirected to a URL that may show an error (this is expected)');
    console.log('3. Copy the ENTIRE URL from your browser\'s address bar');
    const redirectUrl = await prompt('\nPaste the full callback URL here: ');
    
    // Extract code from URL
    const { code, returnedState } = extractCodeFromUrl(redirectUrl);
    
    if (!code) {
      throw new Error('No authorization code found in the URL');
    }
    
    // Verify state if available
    if (returnedState && returnedState !== state) {
      console.warn('\n⚠️ Warning: State mismatch. This could be a security issue.');
      const proceed = await prompt('Do you want to continue anyway? (y/n): ');
      if (proceed.toLowerCase() !== 'y') {
        throw new Error('Operation cancelled due to state mismatch');
      }
    }
    
    // Step 2: Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);
    
    // Save tokens to file
    await saveTokensToFile(tokens);
    
    // Display token information
    displayTokenInfo(tokens);
    
    // Check if we got a refresh token
    if (!tokens.refresh_token) {
      console.log('\n❌ No refresh token received. Make sure you:');
      console.log('1. Requested the offline_access scope');
      console.log('2. Use proper client credentials with refresh token authorization');
      console.log('3. The user granted permission for offline access');
    } else {
      console.log('\n✅ Success! You can now use the refresh token for persistent authentication.');
    }
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
  } finally {
    rl.close();
  }
}

// Run the script
main().catch(console.error);