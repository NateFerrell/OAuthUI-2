/**
 * StockX OAuth Token CLI Tool
 * 
 * Simple CLI tool to set a Bearer token directly
 * Usage: node cli-token.js <Bearer token>
 */

const axios = require('axios');
const fs = require('fs').promises;
const readline = require('readline');

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

// Save token to file
async function saveTokenToFile(token) {
  // Format the token data
  const tokenData = {
    access_token: token.replace(/^Bearer\s+/i, ''),
    refresh_token: null,
    expires_in: 43200, // 12 hours
    obtained_at: Date.now(),
    expires_at: Date.now() + (43200 * 1000)
  };
  
  try {
    // Save to file
    await fs.writeFile('oauth-tokens.json', JSON.stringify(tokenData, null, 2));
    console.log('✅ Token saved to oauth-tokens.json');
    return tokenData;
  } catch (error) {
    console.error('❌ Error saving token:', error.message);
    throw error;
  }
}

// Test the token with StockX API
async function testToken(token) {
  try {
    console.log('🔍 Testing token with StockX API...');
    
    // Make a simple search request
    const response = await axios.get(
      'https://api.stockx.com/v2/catalog/search?query=nike&pageSize=1',
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-api-key': 'OEgPz70FHNL5AxwwK8fJ92Uyk18knTDOdTBxPmi0'
        }
      }
    );
    
    console.log('✅ Token is valid! Response received from StockX API');
    console.log(`Found ${response.data.count} products matching "nike"`);
    return true;
  } catch (error) {
    console.error('❌ API test failed:', error.response?.data || error.message);
    return false;
  }
}

// Main function
async function main() {
  console.log('StockX OAuth Token CLI Tool');
  console.log('===========================');
  
  try {
    // Get token from command line argument or prompt
    let token = process.argv[2];
    
    if (!token) {
      token = await prompt('Enter your Bearer token: ');
    }
    
    if (!token) {
      console.error('❌ No token provided');
      process.exit(1);
    }
    
    // Remove Bearer prefix if present
    const cleanToken = token.replace(/^Bearer\s+/i, '');
    
    // Save token to file
    await saveTokenToFile(cleanToken);
    
    // Test the token
    const isValid = await testToken(cleanToken);
    
    if (isValid) {
      console.log('\n✅ Token is ready to use!');
      console.log('You can now run the OAuth-Flow.js script and use the existing token');
    } else {
      console.log('\n⚠️ Token was saved but may not be valid');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    rl.close();
  }
}

// Run the script
main();