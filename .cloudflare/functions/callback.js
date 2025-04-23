/**
 * Cloudflare Worker for the OAuth callback endpoint
 */

export async function onRequest(context) {
  const { request, env } = context;
  
  // Just serve the callback HTML page
  // The actual token exchange happens via the API endpoint
  
  // Read the HTML content from KV or serve a default one
  try {
    // Try to get the custom callback HTML from KV
    const customHtml = await env.TOKEN_STORE.get('callback.html');
    
    if (customHtml) {
      return new Response(customHtml, {
        headers: { 'Content-Type': 'text/html' }
      });
    }
  } catch (error) {
    console.error('Error reading callback HTML from KV:', error);
  }
  
  // Fallback to default HTML
  return new Response(DEFAULT_CALLBACK_HTML, {
    headers: { 'Content-Type': 'text/html' }
  });
}

// Default callback page HTML
const DEFAULT_CALLBACK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authentication Successful</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      margin: 0;
      padding: 20px;
      background-color: #f5f5f7;
      color: #333;
      line-height: 1.6;
      text-align: center;
    }
    
    .container {
      max-width: 600px;
      margin: 50px auto;
      background-color: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    }
    
    h1 {
      color: #00a046;
      margin-top: 0;
    }
    
    .checkmark {
      color: #00a046;
      font-size: 72px;
      margin: 20px 0;
    }
    
    .button {
      background-color: #00a046;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      font-size: 16px;
      cursor: pointer;
      text-decoration: none;
      display: inline-block;
      margin-top: 20px;
    }
    
    .button:hover {
      background-color: #008a3c;
    }
    
    .loader {
      border: 4px solid #f3f3f3;
      border-top: 4px solid #00a046;
      border-radius: 50%;
      width: 30px;
      height: 30px;
      animation: spin 1s linear infinite;
      margin: 20px auto;
    }
    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    .status {
      margin-top: 20px;
      padding: 15px;
      border-radius: 4px;
    }
    
    .success {
      background-color: #e8f5e9;
      border-left: 4px solid #2e7d32;
      color: #2e7d32;
    }
    
    .error {
      background-color: #ffebee;
      border-left: 4px solid #e53935;
      color: #e53935;
    }
  </style>
</head>
<body>
  <div class="container">
    <div id="processing">
      <h1>Processing Authentication</h1>
      <div class="loader"></div>
      <p>Please wait while we complete your authentication...</p>
    </div>
    
    <div id="success" style="display: none;">
      <h1>Authentication Successful!</h1>
      <div class="checkmark">✓</div>
      <p>You have successfully authenticated with StockX.</p>
      <div class="status success">
        <p>Your authentication tokens have been securely stored.</p>
        <p>They will be automatically refreshed before they expire.</p>
      </div>
      <a href="/" class="button">Return to Main Page</a>
    </div>
    
    <div id="error" style="display: none;">
      <h1>Authentication Failed</h1>
      <div class="status error">
        <p id="errorMessage">An error occurred during authentication.</p>
      </div>
      <a href="/" class="button">Try Again</a>
    </div>
  </div>
  
  <script>
    // Get the code and state from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');
    const errorDescription = urlParams.get('error_description');
    
    // Handle the authentication process
    async function handleAuthentication() {
      // Check for errors in the URL
      if (error) {
        showError(\`\${error}: \${errorDescription || 'No description provided'}\`);
        return;
      }
      
      // Check if code is present
      if (!code) {
        showError('No authorization code received');
        return;
      }
      
      // Exchange code for tokens
      try {
        const response = await fetch('/api/auth/callback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code, state }),
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Failed to complete authentication');
        }
        
        // Show success message
        showSuccess();
      } catch (error) {
        console.error('Authentication error:', error);
        showError(error.message);
      }
    }
    
    // Show success message
    function showSuccess() {
      document.getElementById('processing').style.display = 'none';
      document.getElementById('success').style.display = 'block';
      document.getElementById('error').style.display = 'none';
    }
    
    // Show error message
    function showError(message) {
      document.getElementById('processing').style.display = 'none';
      document.getElementById('success').style.display = 'none';
      document.getElementById('error').style.display = 'block';
      document.getElementById('errorMessage').textContent = message;
    }
    
    // Start the authentication process
    document.addEventListener('DOMContentLoaded', handleAuthentication);
  </script>
</body>
</html>`;