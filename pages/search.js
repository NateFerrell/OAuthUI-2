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
  const [consignmentItems, setConsignmentItems] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showCartSidebar, setShowCartSidebar] = useState(false);
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
  
  const selectProduct = (product) => {
    // Generate size options based on the product's size chart if available
    let sizes = [];
    if (product.sizeChart?.availableConversions && product.sizeChart.availableConversions.length > 0) {
      const conversion = product.sizeChart.availableConversions[0];
      if (conversion.sizes && conversion.sizes.length > 0) {
        sizes = conversion.sizes.map(size => size.value);
      }
    }
    
    // If no sizes are available, provide some default sizes based on product type
    if (sizes.length === 0) {
      if (product.productType?.toLowerCase().includes('shoe')) {
        sizes = ['4', '4.5', '5', '5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '13', '14'];
      } else if (product.productType?.toLowerCase().includes('apparel')) {
        sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
      } else {
        sizes = ['OS']; // One Size
      }
    }
    
    setSelectedProduct({
      ...product,
      availableSizes: sizes,
      selectedSize: sizes[0] || '',
      quantity: 1,
      price: product.retailPrice || 0
    });
  };
  
  const handleSizeChange = (e) => {
    if (!selectedProduct) return;
    setSelectedProduct({
      ...selectedProduct,
      selectedSize: e.target.value
    });
  };
  
  const handleQuantityChange = (e) => {
    if (!selectedProduct) return;
    setSelectedProduct({
      ...selectedProduct,
      quantity: parseInt(e.target.value) || 1
    });
  };
  
  const handlePriceChange = (e) => {
    if (!selectedProduct) return;
    setSelectedProduct({
      ...selectedProduct,
      price: parseFloat(e.target.value) || 0
    });
  };
  
  const addToConsignment = () => {
    if (!selectedProduct || !selectedProduct.selectedSize) return;
    
    // Check if the item already exists in the cart with the same size
    const existingItemIndex = consignmentItems.findIndex(
      item => item.productId === selectedProduct.productId && item.size === selectedProduct.selectedSize
    );
    
    if (existingItemIndex !== -1) {
      // Update existing item
      const updatedCart = [...consignmentItems];
      updatedCart[existingItemIndex] = {
        ...updatedCart[existingItemIndex],
        quantity: updatedCart[existingItemIndex].quantity + selectedProduct.quantity,
        price: selectedProduct.price // Update price to the latest
      };
      setConsignmentItems(updatedCart);
    } else {
      // Add new item
      const newItem = {
        productId: selectedProduct.productId,
        urlKey: selectedProduct.urlKey,
        title: selectedProduct.title,
        image: selectedProduct.productAttributes?.image,
        styleId: selectedProduct.styleId,
        brand: selectedProduct.brand,
        color: selectedProduct.color,
        size: selectedProduct.selectedSize,
        quantity: selectedProduct.quantity,
        price: selectedProduct.price,
        retailPrice: selectedProduct.retailPrice
      };
      setConsignmentItems([...consignmentItems, newItem]);
    }
    
    // Close the product detail and show cart
    setSelectedProduct(null);
    setShowCartSidebar(true);
  };
  
  const removeFromConsignment = (index) => {
    const updatedCart = [...consignmentItems];
    updatedCart.splice(index, 1);
    setConsignmentItems(updatedCart);
  };
  
  const submitConsignment = () => {
    // This would submit the consignment to your backend
    // For now, we'll just show an alert with the items
    alert(`Consignment submitted with ${consignmentItems.length} items!`);
    console.log('Consignment items:', consignmentItems);
    
    // In a real app, you would POST this data to your backend
    // axios.post('/api/submit-consignment', { items: consignmentItems });
    
    // Clear the cart after submission
    setConsignmentItems([]);
    setShowCartSidebar(false);
  };

  return (
    <div className="container">
      <h1>Consignment Inventory</h1>
      
      <div className="header-actions">
        <button 
          className="cart-button"
          onClick={() => setShowCartSidebar(!showCartSidebar)}
        >
          {showCartSidebar ? 'Hide Cart' : 'Show Cart'} ({consignmentItems.length})
        </button>
      </div>
      
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
      
      <div className="main-content">
        <div className={`results-area ${showCartSidebar ? 'with-sidebar' : ''}`}>
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
                    <div className="product-content">
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
                        {product.styleId && <p>Style ID: {product.styleId}</p>}
                        {product.brand && <p>Brand: {product.brand}</p>}
                        {product.color && <p>Color: {product.color}</p>}
                        {product.retailPrice && <p>Retail Price: ${product.retailPrice}</p>}
                      </div>
                    </div>
                    <div className="product-actions">
                      <button 
                        className="select-button"
                        onClick={() => selectProduct(product)}
                      >
                        Select for Consignment
                      </button>
                      <a 
                        href={`https://stockx.com/${product.urlKey}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="view-link"
                      >
                        View on StockX
                      </a>
                    </div>
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
        </div>
        
        {/* Cart Sidebar */}
        {showCartSidebar && (
          <div className="cart-sidebar">
            <div className="cart-header">
              <h2>Consignment Items ({consignmentItems.length})</h2>
              <button 
                className="close-button"
                onClick={() => setShowCartSidebar(false)}
              >
                &times;
              </button>
            </div>
            
            {consignmentItems.length === 0 ? (
              <p className="empty-cart">No items added yet.</p>
            ) : (
              <>
                <div className="cart-items">
                  {consignmentItems.map((item, index) => (
                    <div key={`${item.productId}-${item.size}-${index}`} className="cart-item">
                      {item.image && (
                        <div className="cart-item-image">
                          <img src={item.image} alt={item.title} />
                        </div>
                      )}
                      <div className="cart-item-details">
                        <h4>{item.title}</h4>
                        <p>Size: {item.size}</p>
                        <p>Quantity: {item.quantity}</p>
                        <p>Price: ${item.price}</p>
                        <p>Total: ${(item.price * item.quantity).toFixed(2)}</p>
                      </div>
                      <button 
                        className="remove-button"
                        onClick={() => removeFromConsignment(index)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <div className="cart-summary">
                  <p className="cart-total">
                    Total Items: {consignmentItems.reduce((sum, item) => sum + item.quantity, 0)}
                  </p>
                  <p className="cart-value">
                    Total Value: ${consignmentItems.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2)}
                  </p>
                  <button 
                    className="submit-button"
                    onClick={submitConsignment}
                  >
                    Submit Consignment
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      
      {/* Product Detail Modal */}
      {selectedProduct && (
        <div className="modal-overlay">
          <div className="product-modal">
            <div className="modal-header">
              <h3>{selectedProduct.title}</h3>
              <button 
                className="close-button"
                onClick={() => setSelectedProduct(null)}
              >
                &times;
              </button>
            </div>
            
            <div className="modal-content">
              <div className="modal-product-info">
                {selectedProduct.productAttributes?.image && (
                  <div className="modal-product-image">
                    <img 
                      src={selectedProduct.productAttributes.image} 
                      alt={selectedProduct.title} 
                    />
                  </div>
                )}
                <div className="modal-product-details">
                  {selectedProduct.styleId && <p>Style ID: {selectedProduct.styleId}</p>}
                  {selectedProduct.brand && <p>Brand: {selectedProduct.brand}</p>}
                  {selectedProduct.colorway && <p>Colorway: {selectedProduct.colorway}</p>}
                  {selectedProduct.retailPrice && <p>Retail Price: ${selectedProduct.retailPrice}</p>}
                </div>
              </div>
              
              <div className="consignment-form">
                <div className="form-group">
                  <label htmlFor="size">Size:</label>
                  <select 
                    id="size" 
                    value={selectedProduct.selectedSize}
                    onChange={handleSizeChange}
                  >
                    {selectedProduct.availableSizes?.map(size => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                </div>
                
                <div className="form-group">
                  <label htmlFor="quantity">Quantity:</label>
                  <input 
                    type="number" 
                    id="quantity"
                    min="1"
                    value={selectedProduct.quantity}
                    onChange={handleQuantityChange}
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="price">Price per Unit ($):</label>
                  <input 
                    type="number" 
                    id="price"
                    min="0"
                    step="0.01"
                    value={selectedProduct.price}
                    onChange={handlePriceChange}
                  />
                </div>
                
                <div className="form-summary">
                  <p>Total Value: ${(selectedProduct.price * selectedProduct.quantity).toFixed(2)}</p>
                </div>
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                className="cancel-button"
                onClick={() => setSelectedProduct(null)}
              >
                Cancel
              </button>
              <button 
                className="add-button"
                onClick={addToConsignment}
              >
                Add to Consignment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

      <style jsx>{`
        .container {
          padding: 2rem;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
          max-width: 1400px;
          margin: 0 auto;
          position: relative;
        }
        
        /* Header */
        h1 {
          margin-bottom: 0.5rem;
          color: #333;
        }
        .header-actions {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 1rem;
        }
        .cart-button {
          background-color: #4CAF50;
          color: white;
          border: none;
          padding: 0.6rem 1.2rem;
          font-size: 0.9rem;
          border-radius: 4px;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        .cart-button:hover {
          background-color: #45a049;
        }
        
        /* Search Form */
        .search-form {
          display: flex;
          margin: 1.5rem 0;
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
        
        /* Main Content Layout */
        .main-content {
          display: flex;
          position: relative;
        }
        .results-area {
          flex: 1;
          transition: width 0.3s;
        }
        .results-area.with-sidebar {
          width: calc(100% - 350px);
        }
        
        /* Error and Loading */
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
        
        /* Results Container */
        .results-container {
          margin-top: 1rem;
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
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 1.5rem;
          margin-top: 1rem;
        }
        
        /* Product Cards */
        .product-card {
          border: 1px solid #eaeaea;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
          transition: transform 0.2s, box-shadow 0.2s;
          display: flex;
          flex-direction: column;
        }
        .product-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
        }
        .product-content {
          display: flex;
          flex-direction: column;
          flex: 1;
        }
        .product-image {
          height: 200px;
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
          flex: 1;
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
        .product-id {
          font-size: 0.8rem;
          color: #888;
          border-bottom: 1px solid #eee;
          padding-bottom: 0.5rem;
          margin-bottom: 0.5rem;
        }
        .product-actions {
          padding: 1rem;
          background-color: #f9f9f9;
          border-top: 1px solid #eee;
          display: flex;
          flex-direction: column;
          gap: 0.7rem;
        }
        .select-button {
          background-color: #4CAF50;
          color: white;
          border: none;
          padding: 0.6rem;
          font-size: 0.9rem;
          border-radius: 4px;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        .select-button:hover {
          background-color: #45a049;
        }
        .view-link {
          display: inline-block;
          text-align: center;
          text-decoration: none;
          color: #2196F3;
          font-size: 0.9rem;
        }
        .view-link:hover {
          text-decoration: underline;
        }
        
        /* Pagination */
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
        
        /* Cart Sidebar */
        .cart-sidebar {
          position: fixed;
          top: 0;
          right: 0;
          width: 350px;
          height: 100vh;
          background-color: white;
          box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1);
          display: flex;
          flex-direction: column;
          z-index: 100;
          padding: 1rem;
          overflow-y: auto;
        }
        .cart-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 1rem;
          border-bottom: 1px solid #eee;
          margin-bottom: 1rem;
        }
        .cart-header h2 {
          margin: 0;
          font-size: 1.2rem;
        }
        .close-button {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: #666;
        }
        .empty-cart {
          text-align: center;
          color: #999;
          margin: 2rem 0;
        }
        .cart-items {
          flex: 1;
          overflow-y: auto;
          margin-bottom: 1rem;
        }
        .cart-item {
          display: flex;
          border-bottom: 1px solid #eee;
          padding: 1rem 0;
          position: relative;
        }
        .cart-item-image {
          width: 70px;
          height: 70px;
          margin-right: 1rem;
          flex-shrink: 0;
        }
        .cart-item-image img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .cart-item-details {
          flex: 1;
        }
        .cart-item-details h4 {
          margin: 0 0 0.5rem 0;
          font-size: 0.95rem;
        }
        .cart-item-details p {
          margin: 0.2rem 0;
          font-size: 0.85rem;
          color: #666;
        }
        .remove-button {
          background: none;
          border: none;
          color: #F44336;
          cursor: pointer;
          font-size: 0.8rem;
          padding: 0.3rem;
          position: absolute;
          right: 0;
          bottom: 0.5rem;
        }
        .remove-button:hover {
          text-decoration: underline;
        }
        .cart-summary {
          padding-top: 1rem;
          border-top: 1px solid #eee;
        }
        .cart-total, .cart-value {
          font-weight: 500;
          margin: 0.5rem 0;
        }
        .cart-value {
          margin-bottom: 1rem;
          font-size: 1.1rem;
        }
        .submit-button {
          background-color: #4CAF50;
          color: white;
          border: none;
          padding: 0.8rem;
          font-size: 1rem;
          border-radius: 4px;
          cursor: pointer;
          width: 100%;
          transition: background-color 0.2s;
        }
        .submit-button:hover {
          background-color: #45a049;
        }
        
        /* Product Modal */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 200;
        }
        .product-modal {
          background-color: white;
          border-radius: 8px;
          width: 90%;
          max-width: 600px;
          max-height: 90vh;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          border-bottom: 1px solid #eee;
        }
        .modal-header h3 {
          margin: 0;
          font-size: 1.2rem;
        }
        .modal-content {
          padding: 1.5rem;
          flex: 1;
          overflow-y: auto;
        }
        .modal-product-info {
          display: flex;
          margin-bottom: 1.5rem;
        }
        .modal-product-image {
          width: 120px;
          height: 120px;
          margin-right: 1.5rem;
          flex-shrink: 0;
        }
        .modal-product-image img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .modal-product-details {
          flex: 1;
        }
        .modal-product-details p {
          margin: 0.4rem 0;
          font-size: 0.9rem;
        }
        .consignment-form {
          margin-top: 1rem;
          border-top: 1px solid #eee;
          padding-top: 1.5rem;
        }
        .form-group {
          margin-bottom: 1.2rem;
        }
        .form-group label {
          display: block;
          margin-bottom: 0.4rem;
          font-weight: 500;
        }
        .form-group select, .form-group input {
          width: 100%;
          padding: 0.7rem;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 0.9rem;
        }
        .form-summary {
          margin-top: 1.5rem;
          padding-top: 1rem;
          border-top: 1px solid #eee;
          font-weight: 500;
        }
        .modal-footer {
          padding: 1rem;
          border-top: 1px solid #eee;
          display: flex;
          justify-content: flex-end;
          gap: 1rem;
        }
        .cancel-button {
          background-color: #eee;
          color: #333;
          border: none;
          padding: 0.7rem 1.2rem;
          font-size: 0.9rem;
          border-radius: 4px;
          cursor: pointer;
        }
        .cancel-button:hover {
          background-color: #ddd;
        }
        .add-button {
          background-color: #4CAF50;
          color: white;
          border: none;
          padding: 0.7rem 1.2rem;
          font-size: 0.9rem;
          border-radius: 4px;
          cursor: pointer;
        }
        .add-button:hover {
          background-color: #45a049;
        }
        
        /* Responsive Styles */
        @media (max-width: 768px) {
          .results-area.with-sidebar {
            width: 100%;
          }
          .cart-sidebar {
            width: 100%;
          }
          .modal-product-info {
            flex-direction: column;
          }
          .modal-product-image {
            margin-right: 0;
            margin-bottom: 1rem;
            width: 100%;
            height: 180px;
          }
        }
      `}</style>
    </div>
  );
}