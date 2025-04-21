import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';

export default function Search() {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
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

  const handleSearch = async (e) => {
    e.preventDefault();
    
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
          pageNumber: 1,
          pageSize: 10
        },
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      setResults(response.data.products || []);
      if (response.data.products?.length === 0) {
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
          <div className="results-grid">
            {results.map((product, index) => (
              <div key={product.id || index} className="product-card">
                {product.media?.imageUrl && (
                  <div className="product-image">
                    <img src={product.media.imageUrl} alt={product.name} />
                  </div>
                )}
                <div className="product-info">
                  <h3>{product.name || 'Unknown Product'}</h3>
                  {product.styleId && <p>Style ID: {product.styleId}</p>}
                  {product.brand && <p>Brand: {product.brand}</p>}
                  {product.colorway && <p>Colorway: {product.colorway}</p>}
                  {product.retailPrice && <p>Retail Price: ${product.retailPrice}</p>}
                </div>
              </div>
            ))}
          </div>
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
        }
        .product-image {
          height: 200px;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: #f9f9f9;
        }
        .product-image img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
        }
        .product-info {
          padding: 1rem;
        }
        .product-info h3 {
          margin-top: 0;
          margin-bottom: 0.5rem;
        }
        .product-info p {
          margin: 0.25rem 0;
          color: #666;
        }
      `}</style>
    </div>
  );
}