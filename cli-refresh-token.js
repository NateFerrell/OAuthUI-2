/**
 * StockX OAuth CLI Refresh Token Tool
 * 
 * This tool provides a command-line interface for testing the refresh token flow.
 * It allows initializing OAuth, managing tokens, and refreshing tokens manually.
 */

const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');
const axios = require('axios');
const crypto = require('crypto');
const { exec } = require('child_process');

// Configuration
const config = {
  clientId: 'KlbEZjymb9OBap9a3jWlX9bIx4j4y3ks',
  clientSecret: 'y2GqspIoDSgzoryXS3Ue--5i0xlXQUU09F4cqnuVgn6Szk4efqZy1qGip_EVqmqe',
  redirectUri: 'https://stockx-consignment-portal.pages.dev/callback?format=json&cli=true', // Use the function endpoint with JSON format
  authDomain: 'accounts.stockx.com',
  audience: 'gateway.stockx.com',
  apiBase: 'https://api.stockx.com',
  tokenFile: path.join(process.cwd(), 'cli-tokens.json'),
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
 * Step 1: Redirect the user to get authorization code
 */
async function authorizeUser() {
  console.log('\n=== Step 1: User Authorization ===');
  
  // Add cli=true and format=json parameters to the auth URL
  const { authUrl, state } = getAuthorizationUrl();
  
  // Add parameters to signal we want CLI mode and JSON format
  const cliAuthUrl = `${authUrl}&cli=true&format=json`;
  
  console.log('\nAuthorization URL:');
  console.log(cliAuthUrl);
  
  // Save state for later verification
  await fs.writeFile('oauth-state.json', JSON.stringify({ state }));
  
  // Open the browser for the user to authenticate
  const openBrowser = await prompt('\nOpen this URL in your browser? (y/n): ');
  
  if (openBrowser.toLowerCase() === 'y') {
    // Open URL in the default browser
    const command = process.platform === 'win32' 
      ? `start "${cliAuthUrl}"` 
      : process.platform === 'darwin' 
        ? `open "${cliAuthUrl}"` 
        : `xdg-open "${cliAuthUrl}"`;
    
    exec(command, (error) => {
      if (error) {
        console.log(`\nCouldn't open browser automatically. Please copy and paste the URL manually.`);
      }
    });
  }
  
  console.log('\n=================================================================');
  console.log('                 OAUTH AUTHENTICATION FLOW');
  console.log('=================================================================');
  console.log('\n1. Please login to StockX in the browser window.');
  console.log('2. After logging in, you will be redirected to the callback URL.');
  console.log('3. Copy the ENTIRE URL from your browser after redirection.');
  console.log('4. If you see a 404 error page, that\'s okay! The URL still contains your code.');
  console.log('\nNote: The URL should look something like:');
  console.log(`${config.redirectUri}?code=ABCDEF1234&state=${state}`);
  console.log('=================================================================');
  
  // Manual code entry
  const manualUrl = await prompt('\nPaste the full URL from your browser after redirection: ');
  
  // First check if the user pasted just the code directly
  let code = manualUrl;
  if (!manualUrl.includes('http') && !manualUrl.includes('?') && manualUrl.length > 20) {
    console.log('\nDetected direct code input, not a URL');
    code = manualUrl.trim();
    return code;
  }
  
  // Try to extract code from URL
  if (manualUrl.includes('?')) {
    try {
      console.log('\nExtracting code from URL...');
      
      // Handle the case where the user might have copied the entire URL with quotes
      const cleanUrl = manualUrl.trim().replace(/^['"]|['"]$/g, '');
      
      // Check if response is JSON
      if (cleanUrl.includes('"code"') && cleanUrl.includes('"success":true')) {
        // This might be a JSON response in the URL
        try {
          // Extract JSON from the response
          const jsonMatch = cleanUrl.match(/\{.*\}/);
          if (jsonMatch) {
            const jsonData = JSON.parse(jsonMatch[0]);
            if (jsonData.code) {
              console.log('\nFound code in JSON response');
              code = jsonData.code;
              return code;
            }
          }
        } catch (jsonError) {
          console.log('Could not parse JSON from URL');
        }
      }
      
      // Parse the URL properly
      let url;
      try {
        url = new URL(cleanUrl);
        code = url.searchParams.get('code');
        const urlState = url.searchParams.get('state');
        
        console.log(`Found code: ${code ? 'Yes' : 'No'}`);
        console.log(`Found state: ${urlState ? 'Yes' : 'No'}`);
        
        // Verify state if available
        if (urlState && urlState !== state) {
          console.warn(`\n⚠️ State mismatch warning! Expected: ${state}, Received: ${urlState}`);
          console.warn('This could indicate a security issue (CSRF attack).');
          
          const continueAnyway = await prompt('\nContinue anyway? (y/n): ');
          if (continueAnyway.toLowerCase() !== 'y') {
            throw new Error('Authentication cancelled due to state mismatch');
          }
        }
      } catch (urlError) {
        // If URL parsing failed, try manual extraction
        console.log('URL parsing failed, trying manual extraction');
        const urlParts = cleanUrl.split('?');
        const queryParams = urlParts[1];
        
        if (queryParams) {
          const urlParams = new URLSearchParams(queryParams);
          code = urlParams.get('code');
          const urlState = urlParams.get('state');
          
          console.log(`Manual extraction - Found code: ${code ? 'Yes' : 'No'}`);
          console.log(`Manual extraction - Found state: ${urlState ? 'Yes' : 'No'}`);
        }
      }
      
      // If no code found, just use the original URL
      if (!code) {
        console.log('No code found in URL, checking if the input itself is a code');
        // Check if the input looks like a code (no URL structure, just a string)
        if (!manualUrl.includes('http') && !manualUrl.includes('/')) {
          code = manualUrl.trim();
          console.log('Using input as raw code');
        } else {
          console.log('Could not extract code from URL');
          code = null;
        }
      }
    } catch (error) {
      console.error('\nError parsing URL:', error.message);
      // Try to see if the input itself is just the code
      if (!manualUrl.includes('http') && !manualUrl.includes('/')) {
        code = manualUrl.trim();
      } else {
        code = null;
      }
    }
  }
  
  if (!code) {
    // Ask for just the code if we couldn't extract it from the URL
    console.log('\nCould not find the code in the URL you provided.');
    console.log('Look for a parameter that starts with "code=" in the URL.');
    console.log('The code is usually a long string of letters and numbers after "code=".');
    code = await prompt('\nPlease paste ONLY the authorization code (the value after "code="): ');
    
    // Trim any whitespace
    code = code.trim();
    console.log(`\nManually entered code: ${code.substring(0, 10)}...`);
  }
  
  console.log('\n✅ Authorization code captured successfully.');
  return code;
}

/**
 * Step 2: Exchange the authorization code for tokens
 */
async function exchangeCodeForTokens(code) {
  console.log('\n=== Step 2: Exchange Code for Tokens ===');
  
  // Code should already be properly extracted at this point
  console.log(`\nUsing authorization code: ${code ? code.substring(0, 10) + '...' : 'NONE'}`);
  
  if (!code) {
    throw new Error('No valid authorization code found');
  }
  
  try {
    // Build the token request body
    const tokenData = new URLSearchParams();
    tokenData.append('grant_type', 'authorization_code');
    tokenData.append('client_id', config.clientId);
    tokenData.append('client_secret', config.clientSecret);
    tokenData.append('code', code);
    tokenData.append('redirect_uri', config.redirectUri);
    
    console.log('\nMaking token request...');
    
    console.log('\nMaking token exchange request to StockX...');
    console.log(`URL: https://${config.authDomain}/oauth/token`);
    console.log('Code:', code ? `${code.substring(0, 10)}...` : 'None');
    console.log('Redirect URI:', config.redirectUri);
    
    try {
      // Make the token exchange request with audience
      const tokenDataWithAudience = new URLSearchParams(tokenData.toString());
      tokenDataWithAudience.append('audience', config.audience);
      
      console.log('\nExchange request parameters:');
      console.log('- grant_type:', tokenDataWithAudience.get('grant_type'));
      console.log('- client_id:', tokenDataWithAudience.get('client_id').substring(0, 10) + '...');
      console.log('- redirect_uri:', tokenDataWithAudience.get('redirect_uri'));
      console.log('- audience:', tokenDataWithAudience.get('audience'));
      
      const response = await axios.post(
        `https://${config.authDomain}/oauth/token`,
        tokenDataWithAudience.toString(),
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
          const responseText = await error.response.data;
          console.error('Response:', typeof responseText);
          console.error(responseText);
        } catch (e) {
          console.error('Could not parse response data:', e.message);
        }
      } else {
        console.error(error.message);
      }
      throw new Error('Failed to exchange code for tokens');
    }
    
  } catch (error) {
    console.error('\nError in overall exchange process:');
    console.error(error.message);
    throw error;
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
    
    console.log(`Refreshing access token (refresh count: ${tokens.refresh_count || 0})`);
    
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
    console.error('\nToken refresh error:');
    
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      
      // Handle refresh token expired/invalid
      if (
        error.response.status === 400 && 
        (error.response.data.error === 'invalid_grant' || 
         (error.response.data.error_description && 
          error.response.data.error_description.includes('invalid refresh token')))
      ) {
        console.error('\nRefresh token is invalid or expired, clearing tokens');
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
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      
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
  console.log('   StockX OAuth CLI Refresh Token Tool');
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