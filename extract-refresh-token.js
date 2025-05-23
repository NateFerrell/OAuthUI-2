/**
 * StockX Direct Token Extractor
 * 
 * This script provides a direct way to handle OAuth authentication with StockX,
 * without depending on Cloudflare Workers or other server components.
 * 
 * It uses a direct approach to exchange the authorization code for tokens
 * and then handles refresh tokens completely locally.
 */

const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');
const axios = require('axios');
const crypto = require('crypto');
const { exec } = require('child_process');
const express = require('express');
// We'll use child_process.exec instead of the open package

// Configuration
const config = {
  clientId: 'KlbEZjymb9OBap9a3jWlX9bIx4j4y3ks',
  clientSecret: 'y2GqspIoDSgzoryXS3Ue--5i0xlXQUU09F4cqnuVgn6Szk4efqZy1qGip_EVqmqe',
  localPort: 3333, // Local server port for callback
  redirectUri: 'http://localhost:3333/callback',
  authDomain: 'accounts.stockx.com',
  audience: 'gateway.stockx.com',
  apiBase: 'https://api.stockx.com',
  tokenFile: path.join(process.cwd(), 'stockx-tokens.json'),
  refreshBeforeExpiryMs: 10 * 60 * 1000, // Refresh 10 minutes before expiry
  debug: true // Enable additional logging
};

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Token storage handler
 */
class TokenStorage {
  constructor(filePath) {
    this.filePath = filePath;
  }
  
  /**
   * Load tokens from storage
   */
  async load() {
    try {
      const data = await fs.readFile(this.filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      // If file doesn't exist or is invalid, return null
      return null;
    }
  }
  
  /**
   * Save tokens to storage
   */
  async save(tokens) {
    try {
      await fs.writeFile(this.filePath, JSON.stringify(tokens, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('Error saving tokens:', error);
      return false;
    }
  }
}

/**
 * Prompt for user input
 */
function prompt(question) {
  return new Promise(resolve => {
    rl.question(question, answer => {
      resolve(answer);
    });
  });
}

/**
 * Generate a random state parameter for CSRF protection
 */
function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Generate an authorization URL
 */
function getAuthorizationUrl() {
  // Generate state parameter for security
  const state = generateState();
  
  // Build the authorization URL
  const authUrl = `https://${config.authDomain}/authorize?` +
    `response_type=code&` +
    `client_id=${encodeURIComponent(config.clientId)}&` +
    `redirect_uri=${encodeURIComponent(config.redirectUri)}&` +
    `scope=${encodeURIComponent('offline_access openid')}&` +
    `audience=${encodeURIComponent(config.audience)}&` +
    `state=${state}`;
  
  return { authUrl, state };
}

/**
 * Create a local Express server to handle the OAuth callback
 */
async function createCallbackServer(state) {
  return new Promise((resolve, reject) => {
    // Create Express app
    const app = express();
    let server;
    
    // Handle the callback route
    app.get('/callback', (req, res) => {
      const { code, state: returnedState, error, error_description } = req.query;
      
      // Send a nice HTML response
      res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Authentication ${error ? 'Failed' : 'Successful'}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
              margin: 0;
              padding: 20px;
              background-color: #f5f5f7;
              color: #333;
              line-height: 1.6;
              text-align: center;
            }
            
            .container {
              max-width: 600px;
              margin: 50px auto;
              background-color: white;
              padding: 30px;
              border-radius: 8px;
              box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            }
            
            h1 {
              color: ${error ? '#e53935' : '#00a046'};
              margin-top: 0;
            }
            
            .icon {
              font-size: 72px;
              margin: 20px 0;
              color: ${error ? '#e53935' : '#00a046'};
            }
            
            .status {
              margin-top: 20px;
              padding: 15px;
              border-radius: 4px;
            }
            
            .success {
              background-color: #e8f5e9;
              border-left: 4px solid #2e7d32;
              color: #2e7d32;
            }
            
            .error {
              background-color: #ffebee;
              border-left: 4px solid #e53935;
              color: #e53935;
            }
            
            pre {
              background-color: #f5f5f7;
              padding: 15px;
              border-radius: 4px;
              text-align: left;
              overflow: auto;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            ${error ? `
              <h1>Authentication Failed</h1>
              <div class="icon">❌</div>
              <div class="status error">
                <p>${error}: ${error_description || 'No description provided'}</p>
              </div>
            ` : `
              <h1>Authentication Successful!</h1>
              <div class="icon">✓</div>
              <p>You have successfully authenticated with StockX.</p>
              <div class="status success">
                <p>Authentication code received. You can now close this window and return to the CLI.</p>
              </div>
            `}
          </div>
        </body>
        </html>
      `);
      
      // Close the server
      server.close();
      
      if (error) {
        reject(new Error(`Authentication error: ${error} - ${error_description}`));
      } else if (!code) {
        reject(new Error('No authorization code received'));
      } else if (returnedState !== state) {
        reject(new Error(`State mismatch: expected ${state}, got ${returnedState}`));
      } else {
        resolve(code);
      }
    });
    
    // Start the server
    server = app.listen(config.localPort, () => {
      console.log(`\nLocal callback server started on port ${config.localPort}`);
    });
    
    // Handle server errors
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\nError: Port ${config.localPort} is already in use.`);
        console.error('You may have another instance of this application running.');
        console.error('Please close it and try again, or change the port in the configuration.');
      } else {
        console.error('\nServer error:', err.message);
      }
      reject(err);
    });
  });
}

/**
 * Step 1: Redirect the user to get authorization code
 */
async function authorizeUser() {
  console.log('\n=== Step 1: User Authorization ===');
  
  // Generate authorization URL and state
  const { authUrl, state } = getAuthorizationUrl();
  
  console.log('\nAuthorization URL:');
  console.log(authUrl);
  
  // Create the callback server
  console.log('\nStarting local callback server...');
  
  try {
    // Start the callback server before opening the browser
    const codePromise = createCallbackServer(state);
    
    // Open the browser for the user to authenticate
    console.log('\nOpening browser for authentication...');
    
    // Use exec to open the browser based on the platform
    const openBrowserCommand = process.platform === 'win32' 
      ? `start "${authUrl}"`
      : process.platform === 'darwin' 
        ? `open "${authUrl}"`
        : `xdg-open "${authUrl}"`;
    
    exec(openBrowserCommand, (error) => {
      if (error) {
        console.log('\nCould not open browser automatically. Please copy and paste this URL into your browser:');
        console.log(authUrl);
      }
    });
    
    console.log('\n=================================================================');
    console.log('                 OAUTH AUTHENTICATION FLOW');
    console.log('=================================================================');
    console.log('\n1. Please login to StockX in the browser window that just opened.');
    console.log('2. After logging in, you will be redirected back to this application.');
    console.log('3. The callback will be automatically processed.');
    console.log('\nWaiting for authentication to complete...');
    
    // Wait for the callback to be processed
    const code = await codePromise;
    
    console.log('\n✅ Authorization code received successfully!');
    return code;
  } catch (error) {
    console.error('\nError during authorization:', error.message);
    throw error;
  }
}

/**
 * Step 2: Exchange the authorization code for tokens
 */
async function exchangeCodeForTokens(code) {
  console.log('\n=== Step 2: Exchange Code for Tokens ===');
  
  try {
    // Build the token request body
    const tokenData = new URLSearchParams();
    tokenData.append('grant_type', 'authorization_code');
    tokenData.append('client_id', config.clientId);
    tokenData.append('client_secret', config.clientSecret);
    tokenData.append('code', code);
    tokenData.append('redirect_uri', config.redirectUri);
    tokenData.append('audience', config.audience);
    
    console.log('\nMaking token exchange request to StockX...');
    console.log(`URL: https://${config.authDomain}/oauth/token`);
    console.log('Code:', code ? `${code.substring(0, 10)}...` : 'None');
    console.log('Redirect URI:', config.redirectUri);
    
    console.log('\nRequest parameters:');
    console.log('- grant_type:', tokenData.get('grant_type'));
    console.log('- client_id:', tokenData.get('client_id').substring(0, 10) + '...');
    console.log('- redirect_uri:', tokenData.get('redirect_uri'));
    console.log('- audience:', tokenData.get('audience'));
    
    // Make the token exchange request
    const response = await axios.post(
      `https://${config.authDomain}/oauth/token`,
      tokenData.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    console.log('\n✅ Token response received');
    
    // Add timestamps and expiry info
    const tokens = {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      id_token: response.data.id_token,
      token_type: response.data.token_type,
      expires_in: response.data.expires_in || 43200, // Default 12 hours
      obtained_at: Date.now(),
      expires_at: Date.now() + ((response.data.expires_in || 43200) * 1000),
      refresh_count: 0
    };
    
    // Save tokens to storage
    const storage = new TokenStorage(config.tokenFile);
    await storage.save(tokens);
    
    return tokens;
  } catch (error) {
    console.error('\n❌ Error in token exchange:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      try {
        console.error('Response:', JSON.stringify(error.response.data, null, 2));
      } catch (e) {
        console.error('Response data:', error.response.data);
      }
    } else {
      console.error(error.message);
    }
    throw new Error('Failed to exchange code for tokens');
  }
}

/**
 * Step 3: Refresh the access token using the refresh token
 */
async function refreshAccessToken() {
  console.log('\n=== Step 3: Refresh Access Token ===');
  
  try {
    // Load current tokens
    const storage = new TokenStorage(config.tokenFile);
    const tokens = await storage.load();
    
    if (!tokens || !tokens.refresh_token) {
      throw new Error('No refresh token available');
    }
    
    console.log(`\nRefreshing access token (refresh count: ${tokens.refresh_count || 0})`);
    
    // Build the token request body
    const tokenData = new URLSearchParams();
    tokenData.append('grant_type', 'refresh_token');
    tokenData.append('client_id', config.clientId);
    tokenData.append('client_secret', config.clientSecret);
    tokenData.append('refresh_token', tokens.refresh_token);
    tokenData.append('audience', config.audience);
    
    console.log('\nRefresh token request parameters:');
    console.log('- grant_type: refresh_token');
    console.log('- client_id:', tokenData.get('client_id').substring(0, 10) + '...');
    console.log('- refresh_token:', tokenData.get('refresh_token').substring(0, 10) + '...');
    console.log('- audience:', tokenData.get('audience'));
    
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
    
    // Update token information
    const updatedTokens = {
      ...tokens,
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token || tokens.refresh_token,
      id_token: response.data.id_token || tokens.id_token,
      expires_in: response.data.expires_in || 43200,
      obtained_at: Date.now(),
      expires_at: Date.now() + ((response.data.expires_in || 43200) * 1000),
      refresh_count: (tokens.refresh_count || 0) + 1,
      last_refresh: Date.now()
    };
    
    // Save updated tokens
    await storage.save(updatedTokens);
    
    console.log('\n✅ Token refreshed successfully');
    return updatedTokens;
  } catch (error) {
    console.error('\n❌ Token refresh error:');
    
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      try {
        console.error('Response:', JSON.stringify(error.response.data, null, 2));
      } catch (e) {
        console.error('Response data:', error.response.data);
      }
      
      // Handle refresh token expired/invalid
      if (
        error.response.status === 400 && 
        (error.response.data.error === 'invalid_grant' || 
         (error.response.data.error_description && 
          error.response.data.error_description.includes('invalid refresh token')))
      ) {
        console.error('\n❌ Refresh token is invalid or expired, clearing tokens');
        const storage = new TokenStorage(config.tokenFile);
        await storage.save(null);
      }
    } else {
      console.error(error.message);
    }
    
    throw new Error('Failed to refresh access token');
  }
}

/**
 * Get token status and display it
 */
async function checkTokenStatus() {
  console.log('\n=== Token Status ===');
  
  // Load tokens
  const storage = new TokenStorage(config.tokenFile);
  const tokens = await storage.load();
  
  if (!tokens || !tokens.access_token) {
    console.log('❌ No tokens available');
    return null;
  }
  
  // Calculate expiry info
  const now = Date.now();
  const isExpired = tokens.expires_at && now >= tokens.expires_at;
  const expiresIn = isExpired ? 0 : Math.floor((tokens.expires_at - now) / 1000);
  const expiresInMinutes = Math.floor(expiresIn / 60);
  const isExpiringSoon = !isExpired && expiresIn < 60 * 10; // Less than 10 minutes
  
  // Display token status
  console.log('\nToken Information:');
  console.log(`- Access Token: ${tokens.access_token.substring(0, 10)}...`);
  console.log(`- Has Refresh Token: ${tokens.refresh_token ? 'Yes' : 'No'}`);
  console.log(`- Token Valid: ${!isExpired ? 'Yes' : 'No'}`);
  console.log(`- Token Status: ${
    isExpired ? '❌ Expired' : 
    isExpiringSoon ? '⚠️ Expiring Soon' : 
    '✅ Valid'
  }`);
  console.log(`- Expires In: ${expiresInMinutes} minutes (${expiresIn} seconds)`);
  console.log(`- Obtained At: ${new Date(tokens.obtained_at).toLocaleString()}`);
  if (tokens.last_refresh) {
    console.log(`- Last Refreshed: ${new Date(tokens.last_refresh).toLocaleString()}`);
  }
  console.log(`- Refresh Count: ${tokens.refresh_count || 0}`);
  
  return tokens;
}

/**
 * Make a simple API call to test the token
 */
async function testApiCall(token) {
  console.log('\n=== Testing API Call ===');
  
  try {
    console.log('Making API request to StockX catalog search...');
    
    // Make the API request
    const response = await axios.get(
      `${config.apiBase}/v2/catalog/search?query=nike&pageNumber=1&pageSize=3`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-api-key': 'OEgPz70FHNL5AxwwK8fJ92Uyk18knTDOdTBxPmi0'
        }
      }
    );
    
    console.log('\n✅ API call successful!');
    console.log(`Found ${response.data.count} products`);
    
    // Display first result if available
    if (response.data.products && response.data.products.length > 0) {
      const first = response.data.products[0];
      console.log('\nFirst result:');
      console.log(`- Name: ${first.name || 'Unknown'}`);
      console.log(`- Brand: ${first.brand || 'Unknown'}`);
      if (first.styleId) console.log(`- Style ID: ${first.styleId}`);
    }
    
    return true;
  } catch (error) {
    console.error('\n❌ API call failed:');
    
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      try {
        console.error('Response:', JSON.stringify(error.response.data, null, 2));
      } catch (e) {
        console.error('Response data:', error.response.data);
      }
      
      if (error.response.status === 401) {
        console.error('Authentication failed. Your token may be invalid or expired.');
      }
    } else {
      console.error(error.message);
    }
    
    return false;
  }
}

/**
 * Display the CLI menu
 */
async function showMenu() {
  console.log('\n========================================');
  console.log('   StockX Direct Token Extractor');
  console.log('========================================');
  console.log('1. Check token status');
  console.log('2. Initialize OAuth (get new tokens)');
  console.log('3. Manually refresh token');
  console.log('4. Test API call');
  console.log('5. Clear saved tokens');
  console.log('0. Exit');
  console.log('----------------------------------------');
  
  const choice = await prompt('Enter your choice (0-5): ');
  return choice;
}

/**
 * Main function to drive the CLI tool
 */
async function main() {
  try {
    let running = true;
    
    while (running) {
      const choice = await showMenu();
      
      switch (choice) {
        case '0':
          console.log('\nExiting. Goodbye!');
          running = false;
          break;
        
        case '1':
          await checkTokenStatus();
          break;
        
        case '2':
          console.log('\nInitializing OAuth flow to get new tokens...');
          const code = await authorizeUser();
          await exchangeCodeForTokens(code);
          console.log('\n✅ Authentication completed successfully!');
          break;
        
        case '3':
          try {
            const refreshedTokens = await refreshAccessToken();
            console.log('\nAccess token refreshed and saved successfully!');
            console.log(`New token expires at: ${new Date(refreshedTokens.expires_at).toLocaleString()}`);
          } catch (refreshError) {
            console.error('\nRefresh failed. You may need to initialize OAuth again.');
          }
          break;
        
        case '4':
          const tokens = await checkTokenStatus();
          if (tokens && tokens.access_token) {
            await testApiCall(tokens.access_token);
          } else {
            console.log('\n❌ No valid access token available. Please initialize OAuth first.');
          }
          break;
        
        case '5':
          const confirmClear = await prompt('\nAre you sure you want to clear all saved tokens? (y/n): ');
          if (confirmClear.toLowerCase() === 'y') {
            const storage = new TokenStorage(config.tokenFile);
            await storage.save(null);
            console.log('\n✅ Tokens cleared successfully');
          }
          break;
        
        default:
          console.log('\nInvalid choice. Please select a number between 0 and 5.');
      }
      
      if (running) {
        await prompt('\nPress Enter to continue...');
      }
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    rl.close();
  }
}

// Run the script
main();