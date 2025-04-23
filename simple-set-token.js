/**
 * Simple StockX Token Setter
 * 
 * This script sets a Bearer token directly without any validation
 * Usage: node simple-set-token.js "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImt..."
 */

const fs = require('fs');

// Get token from command line argument
const token = process.argv[2];

if (!token) {
  console.error('Error: No token provided');
  console.log('Usage: node simple-set-token.js "YOUR_TOKEN_HERE"');
  process.exit(1);
}

// Clean the token (remove Bearer prefix if present)
const cleanToken = token.replace(/^Bearer\s+/i, '');

// Create the token data structure
const tokenData = {
  access_token: cleanToken,
  refresh_token: null,
  expires_in: 43200, // 12 hours
  obtained_at: Date.now(),
  expires_at: Date.now() + (43200 * 1000)
};

// Save to file
try {
  fs.writeFileSync('oauth-tokens.json', JSON.stringify(tokenData, null, 2));
  console.log('✅ Token saved successfully to oauth-tokens.json');
  console.log('You can now use OAuth-Flow.js with the existing token');
} catch (error) {
  console.error('❌ Error saving token:', error.message);
}