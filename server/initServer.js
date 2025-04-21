/**
 * Server Initialization
 * 
 * This file is responsible for initializing server-side services like token refresh.
 * In a production environment, this would be called by a server or serverless function.
 */

const tokenManager = require('./tokenManager');

/**
 * Initialize server-side services
 */
function initServer() {
  console.log('Initializing server-side services...');
  
  // Initialize background token refresh
  tokenManager.initBackgroundRefresh();
  
  console.log('Server-side services initialized');
}

// If this file is run directly
if (require.main === module) {
  initServer();
}

module.exports = { initServer };