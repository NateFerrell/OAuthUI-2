import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';

export default function Search() {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [pagination, setPagination] = useState({
    totalCount: 0,
    pageSize: 10,
    pageNumber: 1,
    hasNextPage: false
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const router = useRouter();

  useEffect(() => {
    // Check if we have a valid token
    const tokensStr = localStorage.getItem('oauth-tokens');
    
    if (!tokensStr) {
      // No token found, redirect to home
      router.push('/');
      return;
    }

    try {
      const tokens = JSON.parse(tokensStr);
      const now = Date.now();
      
      // Check if token is valid
      if (!tokens.access_token || !tokens.obtained_at || (now - tokens.obtained_at >= 4 * 60 * 60 * 1000)) {
        // Token invalid or expired, redirect to home
        router.push('/');
        return;
      }
      
      // Set the access token for API calls
      setAccessToken(tokens.access_token);
    } catch (error) {
      console.error('Error parsing token:', error);
      router.push('/');
    }
  }, [router]);

  const fetchProducts = async (pageNum = 1) => {
    if (!searchQuery.trim()) {
      setError('Please enter a search term');
      return;
    }

    setIsLoading(true);
    setError('');
    
    try {
      // Call the API route that will handle the StockX API request
      const response = await axios.get('/api/search', {
        params: {
          query: searchQuery,
          pageNumber: pageNum,
          pageSize: 10
        },
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      const data = response.data;
      setResults(data.products || []);
      
      // Update pagination information
      setPagination({
        totalCount: data.count || 0,
        pageSize: data.pageSize || 10,
        pageNumber: data.pageNumber || 1,
        hasNextPage: data.hasNextPage || false
      });
      
      if (!data.products || data.products.length === 0) {
        setError('No results found. Try a different search term.');
      }
    } catch (error) {
      console.error('Search error:', error);
      setError(
        error.response?.data?.error || 
        'Error searching StockX. Please try again.'
      );
      
      // If token invalid (401), redirect to home
      if (error.response?.status === 401) {
        localStorage.removeItem('oauth-tokens');
        router.push('/');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    await fetchProducts(1);
  };

  const handlePageChange = async (newPage) => {
    await fetchProducts(newPage);
    window.scrollTo(0, 0);
  };

  return (
    <div className="container">
      <h1>StockX Search</h1>
      
      <form onSubmit={handleSearch} className="search-form">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search for products (e.g., nike, jordan)"
          className="search-input"
        />
        <button 
          type="submit" 
          className="search-button"
          disabled={isLoading}
        >
          {isLoading ? 'Searching...' : 'Search'}
        </button>
      </form>
      
      {error && <div className="error-message">{error}</div>}
      
      {isLoading && (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Searching StockX...</p>
        </div>
      )}
      
      {!isLoading && results.length > 0 && (
        <div className="results-container">
          <h2>Search Results</h2>
          <div className="results-summary">
            <p>Total Products: {pagination.totalCount} | Page {pagination.pageNumber} of {Math.ceil(pagination.totalCount / pagination.pageSize) || 1}</p>
            <p>Showing {results.length} products</p>
          </div>
          <div className="results-grid">
            {results.map((product, index) => (
              <div key={product.productId || index} className="product-card">
                <a 
                  href={`https://stockx.com/${product.urlKey}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="product-link"
                >
                  {product.productAttributes?.image && (
                    <div className="product-image">
                      <img 
                        src={product.productAttributes.image} 
                        alt={product.title || 'Product Image'} 
                      />
                    </div>
                  )}
                  <div className="product-info">
                    <h3>{product.title || 'Unknown Product'}</h3>
                    <p className="product-id">Product ID: {product.productId}</p>
                    <p className="url-key">URL Key: {product.urlKey}</p>
                    {product.styleId && <p>Style ID: {product.styleId}</p>}
                    {product.brand && <p>Brand: {product.brand}</p>}
                    {product.colorway && <p>Colorway: {product.colorway}</p>}
                    {product.color && <p>Color: {product.color}</p>}
                    {product.retailPrice && <p>Retail Price: ${product.retailPrice}</p>}
                    {product.productType && <p>Type: {product.productType}</p>}
                    {product.gender && <p>Gender: {product.gender}</p>}
                    {product.releaseDate && <p>Release Date: {product.releaseDate}</p>}
                  </div>
                </a>
              </div>
            ))}
          </div>
          
          {/* Pagination controls */}
          {results.length > 0 && (
            <div className="pagination">
              <button 
                className="pagination-button"
                disabled={pagination.pageNumber <= 1}
                onClick={() => handlePageChange(pagination.pageNumber - 1)}
              >
                Previous
              </button>
              
              <span className="pagination-info">
                Page {pagination.pageNumber} of {Math.ceil(pagination.totalCount / pagination.pageSize) || 1}
              </span>
              
              <button 
                className="pagination-button"
                disabled={!pagination.hasNextPage}
                onClick={() => handlePageChange(pagination.pageNumber + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .container {
          padding: 2rem;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
          max-width: 1200px;
          margin: 0 auto;
        }
        .search-form {
          display: flex;
          margin: 2rem 0;
          max-width: 600px;
        }
        .search-input {
          flex: 1;
          padding: 0.75rem;
          font-size: 1rem;
          border: 1px solid #ccc;
          border-radius: 4px 0 0 4px;
        }
        .search-button {
          background-color: #2196F3;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          font-size: 1rem;
          border-radius: 0 4px 4px 0;
          cursor: pointer;
        }
        .search-button:hover {
          background-color: #0b7dda;
        }
        .search-button:disabled {
          background-color: #cccccc;
          cursor: not-allowed;
        }
        .error-message {
          color: #F44336;
          margin: 1rem 0;
        }
        .loading-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin: 2rem 0;
        }
        .spinner {
          border: 4px solid rgba(0, 0, 0, 0.1);
          border-radius: 50%;
          border-top: 4px solid #2196F3;
          width: 30px;
          height: 30px;
          animation: spin 1s linear infinite;
          margin-bottom: 1rem;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .results-container {
          margin-top: 2rem;
        }
        .results-summary {
          margin-bottom: 1rem;
          padding: 0.5rem;
          background-color: #f0f8ff;
          border-radius: 4px;
        }
        .results-summary p {
          margin: 0;
          font-weight: 500;
        }
        .results-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 1.5rem;
          margin-top: 1rem;
        }
        .product-card {
          border: 1px solid #eaeaea;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .product-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
        }
        .product-link {
          text-decoration: none;
          color: inherit;
          display: block;
        }
        .product-image {
          height: 220px;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: #f9f9f9;
          overflow: hidden;
        }
        .product-image img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          transition: transform 0.3s;
        }
        .product-card:hover .product-image img {
          transform: scale(1.05);
        }
        .product-info {
          padding: 1.25rem;
        }
        .product-info h3 {
          margin-top: 0;
          margin-bottom: 0.75rem;
          font-size: 1.15rem;
          color: #333;
          line-height: 1.3;
        }
        .product-info p {
          margin: 0.35rem 0;
          color: #666;
          font-size: 0.9rem;
          line-height: 1.4;
        }
        .product-id, .url-key {
          font-size: 0.8rem;
          color: #888;
          border-bottom: 1px solid #eee;
          padding-bottom: 0.5rem;
          margin-bottom: 0.5rem;
        }
        .pagination {
          display: flex;
          justify-content: center;
          align-items: center;
          margin-top: 2rem;
          padding: 1rem 0;
        }
        .pagination-button {
          background-color: #2196F3;
          color: white;
          border: none;
          padding: 0.5rem 1rem;
          font-size: 0.9rem;
          border-radius: 4px;
          cursor: pointer;
          margin: 0 0.5rem;
        }
        .pagination-button:hover:not(:disabled) {
          background-color: #0b7dda;
        }
        .pagination-button:disabled {
          background-color: #cccccc;
          cursor: not-allowed;
        }
        .pagination-info {
          margin: 0 1rem;
          font-size: 0.9rem;
          color: #555;
        }
      `}</style>
    </div>
  );
}