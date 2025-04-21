/**
 * API Proxy Service
 * 
 * Handles all StockX API calls using the server-side tokens
 * - Adds authentication headers
 * - Handles errors
 * - Implements caching for performance
 */

const axios = require('axios');
const tokenManager = require('./tokenManager');

// Simple in-memory cache
// In production, use Redis or another caching solution
const cache = {
  data: {},
  
  // Set a cache item with expiration
  set(key, value, ttlSeconds = 300) {
    this.data[key] = {
      value,
      expires: Date.now() + (ttlSeconds * 1000)
    };
  },
  
  // Get a cache item if not expired
  get(key) {
    const item = this.data[key];
    if (!item) return null;
    
    if (Date.now() > item.expires) {
      delete this.data[key];
      return null;
    }
    
    return item.value;
  },
  
  // Clear a specific cache item
  clear(key) {
    delete this.data[key];
  },
  
  // Clear all cache items
  clearAll() {
    this.data = {};
  }
};

/**
 * Make an authenticated request to the StockX API
 * @param {string} method - The HTTP method
 * @param {string} endpoint - The API endpoint
 * @param {Object} params - The query parameters
 * @param {Object} data - The request body
 * @param {boolean} useCache - Whether to use cache for GET requests
 * @param {number} cacheTtl - Cache TTL in seconds
 * @returns {Promise<Object>} The API response
 */
async function makeAuthenticatedRequest(
  method, 
  endpoint, 
  params = {}, 
  data = null, 
  useCache = true,
  cacheTtl = 300
) {
  // For GET requests, check the cache first
  const isGet = method.toLowerCase() === 'get';
  const cacheKey = isGet ? `${endpoint}:${JSON.stringify(params)}` : null;
  
  if (isGet && useCache) {
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      console.log(`Cache hit for ${endpoint}`);
      return cachedData;
    }
  }
  
  try {
    // Get an access token
    const accessToken = await tokenManager.getAccessToken();
    
    // Make the API request
    const response = await axios({
      method,
      url: `https://api.stockx.com${endpoint}`,
      params,
      data,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'x-api-key': 'OEgPz70FHNL5AxwwK8fJ92Uyk18knTDOdTBxPmi0'
      }
    });
    
    // Cache GET responses
    if (isGet && useCache) {
      cache.set(cacheKey, response.data, cacheTtl);
    }
    
    return response.data;
  } catch (error) {
    // Handle token errors
    if (error.response?.status === 401) {
      // Token might be invalid, clear it from cache
      console.error('Authentication error with StockX API');
      cache.clear(cacheKey);
    }
    
    throw new Error(
      error.response?.data?.message || 
      error.message || 
      'Error making request to StockX API'
    );
  }
}

/**
 * Search products in the StockX catalog
 * @param {string} query - The search query
 * @param {number} pageNumber - The page number
 * @param {number} pageSize - The page size
 * @returns {Promise<Object>} The search results
 */
async function searchProducts(query, pageNumber = 1, pageSize = 10) {
  return makeAuthenticatedRequest(
    'get',
    '/v2/catalog/search',
    {
      query,
      pageNumber,
      pageSize
    },
    null,
    true, // use cache
    300 // 5 minutes cache TTL
  );
}

/**
 * Get product details
 * @param {string} productId - The product ID
 * @returns {Promise<Object>} The product details
 */
async function getProductDetails(productId) {
  return makeAuthenticatedRequest(
    'get',
    `/v2/catalog/products/${productId}`,
    {},
    null,
    true, // use cache
    1800 // 30 minutes cache TTL
  );
}

/**
 * Get trending products
 * @param {number} limit - The number of products to return
 * @returns {Promise<Object>} The trending products
 */
async function getTrendingProducts(limit = 10) {
  return makeAuthenticatedRequest(
    'get',
    '/v2/catalog/trending',
    { limit },
    null,
    true, // use cache
    600 // 10 minutes cache TTL
  );
}

module.exports = {
  searchProducts,
  getProductDetails,
  getTrendingProducts,
  clearCache: () => cache.clearAll()
};