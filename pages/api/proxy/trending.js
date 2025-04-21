import { getTrendingProducts } from '../../../server/apiProxy';

/**
 * API route to get trending products from StockX
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get the limit parameter
  const { limit = 10 } = req.query;

  try {
    // Get trending products using the server-side token
    const results = await getTrendingProducts(parseInt(limit));
    
    // Return the trending products
    return res.status(200).json(results);
  } catch (error) {
    console.error('StockX API error:', error);
    return res.status(500).json({ error: 'Failed to get trending products from StockX' });
  }
}