/**
 * Handler for the OAuth callback page
 * Supports both HTML and JSON responses based on Accept header
 */

export async function onRequest(context) {
  const { request, env } = context;
  
  // Handle both approaches for determining JSON response
  // 1. Check Accept header
  const acceptHeader = request.headers.get('Accept') || '';
  // 2. Check query parameter (for CLI tools that might not set Accept header)
  const url = new URL(request.url);
  const formatParam = url.searchParams.get('format');
  
  // Request JSON if either indicator is present
  const wantsJson = acceptHeader.includes('application/json') || formatParam === 'json';
  
  // Extract code and state from URL
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  
  // Check for JSON request (likely from CLI)
  if (wantsJson) {
    console.log('JSON response requested');
    console.log('Request URL:', request.url);
    console.log('Code:', code);
    console.log('State:', state);
    
    if (error) {
      return new Response(JSON.stringify({
        error: error,
        error_description: url.searchParams.get('error_description'),
        success: false
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (!code) {
      return new Response(JSON.stringify({
        error: 'No authorization code provided',
        success: false
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Return the code and state for direct use
    return new Response(JSON.stringify({
      code: code,
      state: state,
      success: true
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // For browser requests, serve the HTML page
  const html = `<!DOCTYPE html>
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
    
    pre {
      background-color: #f5f5f7;
      padding: 15px;
      border-radius: 4px;
      text-align: left;
      overflow: auto;
      font-size: 14px;
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
      <div id="cliCodeBlock" style="margin-top: 20px; display: none;">
        <p><strong>For CLI users:</strong> Copy the authorization code below:</p>
        <pre id="authCode"></pre>
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
    document.addEventListener('DOMContentLoaded', function() {
      // Get the code and state from URL parameters
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      const error = urlParams.get('error');
      const errorDescription = urlParams.get('error_description');
      const isCli = urlParams.get('cli') === 'true';
      
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
      
      // Handle the authentication process
      async function handleAuthentication() {
        // Check for errors in the URL
        if (error) {
          showError(error + ': ' + (errorDescription || 'No description provided'));
          return;
        }
        
        // Check if code is present
        if (!code) {
          showError('No authorization code received');
          return;
        }
        
        // If this is CLI mode, show the code directly
        if (isCli) {
          document.getElementById('cliCodeBlock').style.display = 'block';
          document.getElementById('authCode').textContent = code;
          showSuccess();
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
          
          let data;
          try {
            data = await response.json();
          } catch (e) {
            // If response is not JSON, try to get text
            const text = await response.text();
            if (!response.ok) {
              throw new Error(text || 'Failed to complete authentication');
            }
            // If we got here, show success
            showSuccess();
            return;
          }
          
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
      
      // Start the authentication process
      handleAuthentication();
    });
  </script>
</body>
</html>`;
  
  return new Response(html, {
    headers: { 'Content-Type': 'text/html' }
  });
}