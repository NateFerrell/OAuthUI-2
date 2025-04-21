import { searchProducts } from '../../../server/apiProxy';

/**
 * API route to proxy search requests to StockX
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get the query parameters
  const { query, pageNumber = 1, pageSize = 10 } = req.query;
  
  if (!query) {
    return res.status(400).json({ error: 'Search query is required' });
  }

  try {
    // Search products using the server-side token
    const results = await searchProducts(
      query,
      parseInt(pageNumber),
      parseInt(pageSize)
    );
    
    // Return the search results
    return res.status(200).json(results);
  } catch (error) {
    console.error('StockX API error:', error);
    return res.status(500).json({ error: 'Failed to search StockX' });
  }
}