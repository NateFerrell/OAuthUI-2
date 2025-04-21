import { useEffect } from 'react';

function MyApp({ Component, pageProps }) {
  useEffect(() => {
    // Initialize background token refresh when running on the server
    if (typeof window === 'undefined') {
      // This won't actually run in the browser, it's just to show the intent
      // In a production app, we would use a custom server or serverless function
      try {
        // When running in a real server environment:
        // const { initBackgroundRefresh } = require('../server/tokenManager');
        // initBackgroundRefresh();
        console.log('Server-side token refresh would be initialized here');
      } catch (error) {
        console.error('Failed to initialize token refresh:', error);
      }
    }
  }, []);

  return <Component {...pageProps} />
}

export default MyApp