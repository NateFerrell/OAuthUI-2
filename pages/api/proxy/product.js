import { getProductDetails } from '../../../server/apiProxy';

/**
 * API route to get product details from StockX
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get the product ID from the query parameters
  const { id } = req.query;
  
  if (!id) {
    return res.status(400).json({ error: 'Product ID is required' });
  }

  try {
    // Get product details using the server-side token
    const product = await getProductDetails(id);
    
    // Return the product details
    return res.status(200).json(product);
  } catch (error) {
    console.error('StockX API error:', error);
    return res.status(500).json({ error: 'Failed to get product details from StockX' });
  }
}