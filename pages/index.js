import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import styles from '../styles/search.module.css';

export default function Home() {
  const [authStatus, setAuthStatus] = useState('checking');
  const [trendingProducts, setTrendingProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    // Check authentication status and load trending products
    checkAuthAndLoadProducts();
  }, []);

  const checkAuthAndLoadProducts = async () => {
    try {
      // Check server-side token status
      const statusResponse = await axios.get('/api/auth/status');
      const tokenStatus = statusResponse.data;

      if (tokenStatus.is_valid) {
        setAuthStatus('authenticated');
        
        // Load trending products
        await loadTrendingProducts();
      } else {
        setAuthStatus('unauthenticated');
        
        // Start the OAuth flow
        await startServerOAuthFlow();
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      setAuthStatus('error');
      setError('Failed to check authentication status');
    } finally {
      setIsLoading(false);
    }
  };

  const loadTrendingProducts = async () => {
    try {
      setIsLoading(true);
      
      // Call our proxy endpoint to get trending products
      const response = await axios.get('/api/proxy/trending', {
        params: { limit: 12 }
      });
      
      // Set trending products
      setTrendingProducts(response.data.products || []);
    } catch (error) {
      console.error('Error loading trending products:', error);
      setError('Failed to load trending products');
    } finally {
      setIsLoading(false);
    }
  };

  const startServerOAuthFlow = async () => {
    try {
      // Get the authorization URL from our API
      const response = await axios.get('/api/auth/init');
      
      // Redirect to StockX for authentication
      window.location.href = response.data.authUrl;
    } catch (error) {
      console.error('Error starting OAuth flow:', error);
      setError('Failed to start authentication');
    }
  };

  const handleSearchClick = () => {
    router.push('/search');
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <h1>StockX Consignment Portal</h1>
        <div className={styles.loadingContainer}>
          <div className={styles.spinner}></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h1>StockX Consignment Portal</h1>
      
      {authStatus === 'authenticated' ? (
        <div>
          <div className={styles.authStatusBanner}>
            <div className={styles.statusIcon}>✓</div>
            <p>Server-managed authentication active</p>
          </div>
          
          <div className={styles.actionButtons}>
            <button 
              className={styles.searchButton}
              onClick={handleSearchClick}
            >
              Search Products
            </button>
          </div>
          
          {error && <div className={styles.errorMessage}>{error}</div>}
          
          {trendingProducts.length > 0 && (
            <div className={styles.resultsContainer}>
              <h2>Trending Products</h2>
              <div className={styles.resultsGrid}>
                {trendingProducts.map((product, index) => (
                  <div key={product.productId || index} className={styles.productCard}>
                    <div className={styles.productContent}>
                      {product.productAttributes?.image && (
                        <div className={styles.productImage}>
                          <img 
                            src={product.productAttributes.image} 
                            alt={product.title || 'Product Image'} 
                          />
                        </div>
                      )}
                      <div className={styles.productInfo}>
                        <h3>{product.title || 'Unknown Product'}</h3>
                        {product.styleId && <p>Style ID: {product.styleId}</p>}
                        {product.brand && <p>Brand: {product.brand}</p>}
                        {product.retailPrice && <p>Retail Price: ${product.retailPrice}</p>}
                      </div>
                    </div>
                    <div className={styles.productActions}>
                      <button 
                        className={styles.selectButton}
                        onClick={handleSearchClick}
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className={styles.authContainer}>
          {authStatus === 'unauthenticated' && (
            <div className={styles.centerContent}>
              <p>Server authentication is needed</p>
              <button 
                className={styles.authButton}
                onClick={startServerOAuthFlow}
              >
                Authenticate with StockX
              </button>
            </div>
          )}
          
          {authStatus === 'error' && (
            <div className={styles.errorContainer}>
              <div className={styles.errorIcon}>✗</div>
              <p>{error || 'Authentication error'}</p>
              <button 
                className={styles.retryButton}
                onClick={checkAuthAndLoadProducts}
              >
                Retry
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* Additional styles for new elements */}
      <style jsx>{`
        .authStatusBanner {
          display: flex;
          align-items: center;
          background-color: #e8f5e9;
          padding: 0.75rem 1rem;
          border-radius: 4px;
          margin: 1rem 0;
        }
        .statusIcon {
          color: #4CAF50;
          font-size: 1.25rem;
          margin-right: 0.75rem;
        }
        .actionButtons {
          margin: 1.5rem 0;
          display: flex;
          gap: 1rem;
        }
        .centerContent {
          text-align: center;
          padding: 2rem;
        }
        .authContainer {
          margin: 2rem auto;
          max-width: 500px;
          padding: 2rem;
          border-radius: 8px;
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        }
        .errorContainer {
          display: flex;
          flex-direction: column;
          align-items: center;
          color: #F44336;
        }
        .errorIcon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }
        .authButton {
          background-color: #2196F3;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          font-size: 1rem;
          border-radius: 4px;
          cursor: pointer;
          margin-top: 1rem;
        }
        .authButton:hover {
          background-color: #0b7dda;
        }
        .retryButton {
          background-color: #F44336;
          color: white;
          border: none;
          padding: 0.5rem 1rem;
          font-size: 0.9rem;
          border-radius: 4px;
          cursor: pointer;
          margin-top: 1rem;
        }
        .retryButton:hover {
          background-color: #d32f2f;
        }
      `}</style>
    </div>
  );
}