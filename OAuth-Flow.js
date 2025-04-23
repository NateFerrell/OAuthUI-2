/**
 * StockX OAuth2 Flow
 * 
 * This script walks through the complete OAuth2 authorization code flow
 * with StockX, following their official documentation.
 */
const axios = require('axios');
const readline = require('readline');
const fs = require('fs').promises;
const crypto = require('crypto');
const { exec } = require('child_process');
const path = require('path');
const express = require('express');
const http = require('http');
const url = require('url');

// Configuration
const config = {
  clientId: 'KlbEZjymb9OBap9a3jWlX9bIx4j4y3ks',
  clientSecret: 'y2GqspIoDSgzoryXS3Ue--5i0xlXQUU09F4cqnuVgn6Szk4efqZy1qGip_EVqmqe',
  redirectUri: 'https://stockx-consignment-portal.pages.dev/callback',
  useLocalServer: false, // Set to true to use local server, false to use manual redirect capture
  localPort: 3000, // Port for local server if used
  authDomain: 'accounts.stockx.com',
  audience: 'gateway.stockx.com',
  scope: 'offline_access openid'
};

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Generate a random state parameter for CSRF protection
 */
function generateState() {
  return crypto.randomBytes(16).toString('hex');
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
 * Start a local server to capture the OAuth callback
 */
function startLocalServer(expectedState) {
  return new Promise((resolve, reject) => {
    // Create express app for handling the callback
    const app = express();
    let server = null;
    
    // Add a timeout to shut down the server if no callback is received
    const serverTimeout = setTimeout(() => {
      if (server) {
        server.close();
        reject(new Error('Callback server timed out after 5 minutes'));
      }
    }, 5 * 60 * 1000); // 5 minutes timeout
    
    // Handle the OAuth callback
    app.get('/callback', (req, res) => {
      const { code, state, error, error_description } = req.query;
      
      // Clear the timeout since we received a callback
      clearTimeout(serverTimeout);
      
      // Check for errors from the OAuth provider
      if (error) {
        res.send(`
          <html>
            <head><title>Authentication Error</title></head>
            <body>
              <h2>Authentication Error</h2>
              <p>Error: ${error}</p>
              <p>Description: ${error_description || 'No description provided'}</p>
              <p>You can close this window now.</p>
            </body>
          </html>
        `);
        server.close();
        reject(new Error(`OAuth error: ${error}: ${error_description || 'No description provided'}`));
        return;
      }
      
      // Verify state parameter to prevent CSRF attacks
      if (state !== expectedState) {
        res.send(`
          <html>
            <head><title>Authentication Error</title></head>
            <body>
              <h2>State Verification Failed</h2>
              <p>Expected: ${expectedState}</p>
              <p>Received: ${state}</p>
              <p>This could be a security issue. You can close this window now.</p>
            </body>
          </html>
        `);
        console.warn(`⚠️ State mismatch warning! Expected: ${expectedState}, Received: ${state}`);
        server.close();
        reject(new Error('State parameter mismatch'));
        return;
      }
      
      // Check for authorization code
      if (!code) {
        res.send(`
          <html>
            <head><title>Authentication Error</title></head>
            <body>
              <h2>Missing Authorization Code</h2>
              <p>No authorization code was received.</p>
              <p>You can close this window now.</p>
            </body>
          </html>
        `);
        server.close();
        reject(new Error('No authorization code received'));
        return;
      }
      
      // Success! Send a response to the browser
      res.send(`
        <html>
          <head><title>Authentication Successful</title></head>
          <body>
            <h2>Authentication Successful!</h2>
            <p>You have successfully authenticated with StockX.</p>
            <p>You can close this window and return to the application.</p>
          </body>
        </html>
      `);
      
      // Close the server and resolve the promise with the code
      server.close();
      resolve(code);
    });
    
    // Start the server on the specified port
    server = app.listen(config.localPort, () => {
      console.log(`\nLocal callback server started on port ${config.localPort}`);
    });
    
    // Handle server errors
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\nError: Port ${config.localPort} is already in use.`);
        console.error('This may happen if you have another instance of this script running.');
        console.error('Please close the other instance or use a different port.');
      } else {
        console.error('\nServer error:', err.message);
      }
      reject(err);
    });
  });
}

/**
 * Step 1: Generate the authorization URL and redirect the user
 */
async function authorizeUser() {
  // Generate state parameter for security
  const state = generateState();
  
  // Build the authorization URL with the redirect_uri
  const authUrl = `https://${config.authDomain}/authorize?` +
    `response_type=code&` +
    `client_id=${encodeURIComponent(config.clientId)}&` +
    `redirect_uri=${encodeURIComponent(config.redirectUri)}&` +
    `scope=${encodeURIComponent(config.scope)}&` +
    `audience=${encodeURIComponent(config.audience)}&` +
    `state=${state}`;
  
  console.log('Step 1: Redirecting to StockX authorization page');
  console.log('\nAuthorization URL:');
  console.log(authUrl);
  
  // Save state for later verification
  await fs.writeFile('oauth-state.json', JSON.stringify({ state }));
  
  let codePromise = null;
  
  // If using local server, start it to capture the callback
  if (config.useLocalServer) {
    console.log('\nStarting local callback server...');
    codePromise = startLocalServer(state);
  }
  
  // Open the browser for the user to authenticate
  const openBrowser = await prompt('\nOpen this URL in your browser? (y/n): ');
  
  if (openBrowser.toLowerCase() === 'y') {
    // Open URL in the default browser
    const command = process.platform === 'win32' 
      ? `start "${authUrl}"` 
      : process.platform === 'darwin' 
        ? `open "${authUrl}"` 
        : `xdg-open "${authUrl}"`;
    
    exec(command, (error) => {
      if (error) {
        console.log(`\nCouldn't open browser automatically. Please copy and paste the URL manually.`);
      }
    });
  }
  
  // Different instructions based on whether we're using local server
  if (config.useLocalServer && codePromise) {
    console.log('\nPlease login to StockX in the browser window.');
    console.log('After authentication, you will be redirected back to the local server.');
    console.log('Waiting for callback...');
    
    try {
      // Wait for the callback to be received
      const code = await codePromise;
      console.log('\nCallback received successfully!');
      return { state, code };
    } catch (error) {
      console.error(`\nCallback error: ${error.message}`);
      // Fall through to manual entry
    }
  } else {
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
  }
  
  // Manual code entry (used as fallback for local server or primary method without local server)
  const manualUrl = await prompt('\nPaste the full URL from your browser after redirection: ');
  
  // Try to extract code from URL
  let code = manualUrl;
  if (manualUrl.includes('?')) {
    const urlParams = new URLSearchParams(manualUrl.split('?')[1]);
    const urlState = urlParams.get('state');
    code = urlParams.get('code') || manualUrl;
    
    // Verify state if available
    if (urlState && urlState !== state) {
      console.warn(`\n⚠️ State mismatch warning! Expected: ${state}, Received: ${urlState}`);
      console.warn('This could indicate a security issue (CSRF attack).');
      
      const continueAnyway = await prompt('\nContinue anyway? (y/n): ');
      if (continueAnyway.toLowerCase() !== 'y') {
        throw new Error('Authentication cancelled due to state mismatch');
      }
    }
  }
  
  if (!code) {
    // Ask for just the code if we couldn't extract it from the URL
    console.log('\nCould not find the code in the URL you provided.');
    console.log('Look for a parameter that starts with "code=" in the URL.');
    console.log('The code is usually a long string of letters and numbers after "code=".');
    code = await prompt('\nPlease paste ONLY the authorization code (the value after "code="): ');
  }
  
  console.log('\n✅ Authorization code captured successfully.');
  return { state, code };
}

// Note: The getAuthorizationCode function is no longer needed as the code is directly captured
// by the local server or extracted from manual input in the authorizeUser function

/**
 * Step 3: Exchange the authorization code for tokens
 */
async function exchangeCodeForTokens(code) {
  console.log('\nStep 3: Exchanging authorization code for tokens');
  
  try {
    // Build the token request body
    const tokenData = new URLSearchParams();
    tokenData.append('grant_type', 'authorization_code');
    tokenData.append('client_id', config.clientId);
    tokenData.append('client_secret', config.clientSecret);
    tokenData.append('code', code);
    tokenData.append('redirect_uri', config.redirectUri); // Include the redirect_uri
    
    console.log('\nMaking token request with data:');
    console.log(tokenData.toString());
    
    // Make the token exchange request
    const response = await axios.post(`https://${config.authDomain}/oauth/token`, 
      tokenData.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    console.log('\nTokens received successfully!');
    
    // Add expiration timestamps
    const tokens = {
      ...response.data,
      obtained_at: Date.now(),
      expires_at: Date.now() + (response.data.expires_in * 1000)
    };
    
    // Save tokens to file
    await fs.writeFile('oauth-tokens.json', JSON.stringify(tokens, null, 2));
    
    return tokens;
  } catch (error) {
    console.error('\nError exchanging code for tokens:');
    
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
    
    throw error;
  }
}

/**
 * Make API call to search the StockX catalog
 */
async function searchCatalog(tokens, searchQuery = 'nike', pageNumber = 1, pageSize = 10) {
  try {
    console.log(`\n🔍 Searching for: "${searchQuery}" (page ${pageNumber}, size ${pageSize})`);
    
    // Build query parameters
    const params = new URLSearchParams({
      query: searchQuery,
      pageNumber: pageNumber.toString(),
      pageSize: pageSize.toString()
    });
    
    console.log('Making API request to StockX...');
    
    // Make the API request
    const response = await axios.get(
      `https://api.stockx.com/v2/catalog/search?${params.toString()}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokens.access_token}`,
          'x-api-key': 'OEgPz70FHNL5AxwwK8fJ92Uyk18knTDOdTBxPmi0'
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('❌ Error searching catalog:');
    
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
      
      if (error.response.status === 401) {
        console.error('Authentication failed. Your token may be invalid or expired.');
      }
    } else {
      console.error(error.message);
    }
    
    throw error;
  }
}

/**
 * Save search results to JSON file
 */
async function saveResults(data, searchQuery) {
  const filename = `results-${searchQuery.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}.json`;
  try {
    await fs.writeFile(path.join(__dirname, filename), JSON.stringify(data, null, 2));
    console.log(`\n✅ Results saved to ${filename}`);
    return filename;
  } catch (error) {
    console.error('Error saving results:', error.message);
  }
}

/**
 * Display search results in the console
 */
function displaySearchResults(data, searchQuery) {
  console.log(`\n✅ Found ${data.count} products matching "${searchQuery}"`);
  
  if (data.products && data.products.length > 0) {
    console.log('\nProducts:');
    data.products.forEach((product, index) => {
      console.log(`\n[${index + 1}] ${product.name || 'Unknown Product'}`);
      if (product.styleId) console.log(`Style ID: ${product.styleId}`);
      if (product.brand) console.log(`Brand: ${product.brand}`);
      if (product.colorway) console.log(`Colorway: ${product.colorway}`);
      if (product.retailPrice) console.log(`Retail Price: $${product.retailPrice}`);
    });
  } else {
    console.log('No products found matching your search.');
  }
}

/**
 * Display token information and usage examples
 */
function displayTokenInfo(tokens) {
  console.log('\n✅ OAUTH2 FLOW COMPLETED SUCCESSFULLY');
  console.log('\n=================== YOUR TOKENS ===================');
  console.log(`Access Token: ${tokens.access_token.substring(0, 20)}...`);
  console.log(`Token Type: ${tokens.token_type}`);
  console.log(`Expires In: ${tokens.expires_in} seconds`);
  if (tokens.refresh_token) {
    console.log(`Refresh Token: ${tokens.refresh_token.substring(0, 10)}...`);
  }
  console.log('====================================================');
  
  console.log('\n📝 HOW TO USE YOUR TOKEN WITH THE STOCKX API:');
  console.log('Include these headers in your API requests:');
  console.log(`Authorization: Bearer ${tokens.access_token}`);
  console.log(`x-api-key: OEgPz70FHNL5AxwwK8fJ92Uyk18knTDOdTBxPmi0`);
  
  console.log('\nExample curl command:');
  console.log(`curl --request GET 'https://api.stockx.com/v2/catalog/search?query=nike' \\
--header 'Content-Type: application/json' \\
--header 'Authorization: Bearer ${tokens.access_token}' \\
--header 'x-api-key: OEgPz70FHNL5AxwwK8fJ92Uyk18knTDOdTBxPmi0'`);
}

/**
 * Main function to drive the OAuth flow
 */
async function main() {
  try {
    console.log('StockX OAuth2 Flow');
    console.log('=================');
    
    let tokens;
    
    // Check if we have tokens from a previous run
    try {
      const tokenFile = await fs.readFile('oauth-tokens.json', 'utf8');
      tokens = JSON.parse(tokenFile);
      
      console.log('\nFound existing tokens. Expiration:', new Date(tokens.expires_at).toLocaleString());
      const useExisting = await prompt('Use existing tokens? (y/n): ');
      
      if (useExisting.toLowerCase() !== 'y') {
        tokens = null;
      }
    } catch (err) {
      // No tokens file or invalid format
      tokens = null;
    }
    
    // If no valid tokens, do the OAuth flow
    if (!tokens) {
      // Step 1: Authorize the user and get the code
      const { code } = await authorizeUser();
      
      // Step 3: Exchange code for tokens
      tokens = await exchangeCodeForTokens(code);
      
      // Display token info and usage examples
      displayTokenInfo(tokens);
    }
    
    // Ask if user wants to search
    const doSearch = await prompt('\nWould you like to search the StockX catalog now? (y/n): ');
    
    if (doSearch.toLowerCase() === 'y') {
      // Get search parameters
      const searchQuery = await prompt('Enter search term (e.g., nike, jordan): ');
      const pageNumber = parseInt(await prompt('Enter page number (default: 1): ') || '1');
      const pageSize = parseInt(await prompt('Enter results per page (default: 5): ') || '5');
      
      // Make the API call
      const searchResults = await searchCatalog(tokens, searchQuery, pageNumber, pageSize);
      
      // Save results to file
      await saveResults(searchResults, searchQuery);
      
      // Display the results
      displaySearchResults(searchResults, searchQuery);
    }
    
    console.log('\n✅ All done! You now have your StockX API token and search results.');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    rl.close();
  }
}

// Run the script
main();