import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import styles from '../styles/search.module.css';

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
    // Check the server-side token status
    checkServerTokenStatus();
  }, [router]);
  
  const checkServerTokenStatus = async () => {
    try {
      // Get token status from the server API
      const statusResponse = await axios.get('/api/auth/status');
      const tokenStatus = statusResponse.data;
      
      if (!tokenStatus.is_valid) {
        // Token invalid or missing, redirect to home
        router.push('/');
        return;
      }
      
      // We don't need to set an access token anymore since it's managed by the server
      // Just set a flag that authorization is valid
      setAccessToken('server-managed');
    } catch (error) {
      console.error('Error checking token status:', error);
      router.push('/');
    }
  };

  const fetchProducts = async (pageNum = 1) => {
    if (!searchQuery.trim()) {
      setError('Please enter a search term');
      return;
    }

    setIsLoading(true);
    setError('');
    
    try {
      // Call our proxy endpoint that uses server-side authentication
      const response = await axios.get('/api/proxy/search', {
        params: {
          query: searchQuery,
          pageNumber: pageNum,
          pageSize: 10
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
    <div className={styles.container}>
      <h1 className={styles.title}>Consignment Inventory</h1>
      
      <div className={styles.headerActions}>
        <button 
          className={styles.cartButton}
          onClick={() => setShowCartSidebar(!showCartSidebar)}
        >
          {showCartSidebar ? 'Hide Cart' : 'Show Cart'} ({consignmentItems.length})
        </button>
      </div>
      
      <form onSubmit={handleSearch} className={styles.searchForm}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search for products (e.g., nike, jordan)"
          className={styles.searchInput}
        />
        <button 
          type="submit" 
          className={styles.searchButton}
          disabled={isLoading}
        >
          {isLoading ? 'Searching...' : 'Search'}
        </button>
      </form>
      
      {error && <div className={styles.errorMessage}>{error}</div>}
      
      {isLoading && (
        <div className={styles.loadingContainer}>
          <div className={styles.spinner}></div>
          <p>Searching StockX...</p>
        </div>
      )}
      
      <div className={styles.mainContent}>
        <div className={`${styles.resultsArea} ${showCartSidebar ? styles.withSidebar : ''}`}>
          {!isLoading && results.length > 0 && (
            <div className={styles.resultsContainer}>
              <h2>Search Results</h2>
              <div className={styles.resultsSummary}>
                <p>Total Products: {pagination.totalCount} | Page {pagination.pageNumber} of {Math.ceil(pagination.totalCount / pagination.pageSize) || 1}</p>
                <p>Showing {results.length} products</p>
              </div>
              <div className={styles.resultsGrid}>
                {results.map((product, index) => (
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
                        <p className={styles.productId}>Product ID: {product.productId}</p>
                        {product.styleId && <p>Style ID: {product.styleId}</p>}
                        {product.brand && <p>Brand: {product.brand}</p>}
                        {product.color && <p>Color: {product.color}</p>}
                        {product.retailPrice && <p>Retail Price: ${product.retailPrice}</p>}
                      </div>
                    </div>
                    <div className={styles.productActions}>
                      <button 
                        className={styles.selectButton}
                        onClick={() => selectProduct(product)}
                      >
                        Select for Consignment
                      </button>
                      <a 
                        href={`https://stockx.com/${product.urlKey}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.viewLink}
                      >
                        View on StockX
                      </a>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Pagination controls */}
              {results.length > 0 && (
                <div className={styles.pagination}>
                  <button 
                    className={styles.paginationButton}
                    disabled={pagination.pageNumber <= 1}
                    onClick={() => handlePageChange(pagination.pageNumber - 1)}
                  >
                    Previous
                  </button>
                  
                  <span className={styles.paginationInfo}>
                    Page {pagination.pageNumber} of {Math.ceil(pagination.totalCount / pagination.pageSize) || 1}
                  </span>
                  
                  <button 
                    className={styles.paginationButton}
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
          <div className={styles.cartSidebar}>
            <div className={styles.cartHeader}>
              <h2>Consignment Items ({consignmentItems.length})</h2>
              <button 
                className={styles.closeButton}
                onClick={() => setShowCartSidebar(false)}
              >
                &times;
              </button>
            </div>
            
            {consignmentItems.length === 0 ? (
              <p className={styles.emptyCart}>No items added yet.</p>
            ) : (
              <>
                <div className={styles.cartItems}>
                  {consignmentItems.map((item, index) => (
                    <div key={`${item.productId}-${item.size}-${index}`} className={styles.cartItem}>
                      {item.image && (
                        <div className={styles.cartItemImage}>
                          <img src={item.image} alt={item.title} />
                        </div>
                      )}
                      <div className={styles.cartItemDetails}>
                        <h4>{item.title}</h4>
                        <p>Size: {item.size}</p>
                        <p>Quantity: {item.quantity}</p>
                        <p>Price: ${item.price}</p>
                        <p>Total: ${(item.price * item.quantity).toFixed(2)}</p>
                      </div>
                      <button 
                        className={styles.removeButton}
                        onClick={() => removeFromConsignment(index)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <div className={styles.cartSummary}>
                  <p className={styles.cartTotal}>
                    Total Items: {consignmentItems.reduce((sum, item) => sum + item.quantity, 0)}
                  </p>
                  <p className={styles.cartValue}>
                    Total Value: ${consignmentItems.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2)}
                  </p>
                  <button 
                    className={styles.submitButton}
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
        <div className={styles.modalOverlay}>
          <div className={styles.productModal}>
            <div className={styles.modalHeader}>
              <h3>{selectedProduct.title}</h3>
              <button 
                className={styles.closeButton}
                onClick={() => setSelectedProduct(null)}
              >
                &times;
              </button>
            </div>
            
            <div className={styles.modalContent}>
              <div className={styles.modalProductInfo}>
                {selectedProduct.productAttributes?.image && (
                  <div className={styles.modalProductImage}>
                    <img 
                      src={selectedProduct.productAttributes.image} 
                      alt={selectedProduct.title} 
                    />
                  </div>
                )}
                <div className={styles.modalProductDetails}>
                  {selectedProduct.styleId && <p>Style ID: {selectedProduct.styleId}</p>}
                  {selectedProduct.brand && <p>Brand: {selectedProduct.brand}</p>}
                  {selectedProduct.colorway && <p>Colorway: {selectedProduct.colorway}</p>}
                  {selectedProduct.retailPrice && <p>Retail Price: ${selectedProduct.retailPrice}</p>}
                </div>
              </div>
              
              <div className={styles.consignmentForm}>
                <div className={styles.formGroup}>
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
                
                <div className={styles.formGroup}>
                  <label htmlFor="quantity">Quantity:</label>
                  <input 
                    type="number" 
                    id="quantity"
                    min="1"
                    value={selectedProduct.quantity}
                    onChange={handleQuantityChange}
                  />
                </div>
                
                <div className={styles.formGroup}>
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
                
                <div className={styles.formSummary}>
                  <p>Total Value: ${(selectedProduct.price * selectedProduct.quantity).toFixed(2)}</p>
                </div>
              </div>
            </div>
            
            <div className={styles.modalFooter}>
              <button 
                className={styles.cancelButton}
                onClick={() => setSelectedProduct(null)}
              >
                Cancel
              </button>
              <button 
                className={styles.addButton}
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
}