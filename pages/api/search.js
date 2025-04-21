import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get the query parameters
  const { query, pageNumber = 1, pageSize = 10 } = req.query;
  
  // Get the authorization header
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token is required' });
  }
  
  if (!query) {
    return res.status(400).json({ error: 'Search query is required' });
  }

  try {
    // Extract token from header
    const token = authHeader.split(' ')[1];
    
    // Build query parameters
    const params = new URLSearchParams({
      query: query,
      pageNumber: pageNumber.toString(),
      pageSize: pageSize.toString()
    });

    // Make the API request to StockX
    const response = await axios.get(
      `https://api.stockx.com/v2/catalog/search?${params.toString()}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-api-key': 'OEgPz70FHNL5AxwwK8fJ92Uyk18knTDOdTBxPmi0'
        }
      }
    );

    // Return the search results
    return res.status(200).json(response.data);
  } catch (error) {
    console.error('StockX API error:', error.response?.data || error.message);
    
    // Forward the status code from StockX
    return res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to search StockX'
    });
  }
}