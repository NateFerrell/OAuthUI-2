# StockX OAuth with Persistent Refresh Tokens

This package provides a robust implementation of StockX's OAuth 2.0 flow with automated token refresh capability, ensuring continuous API access without downtime.

## Features

- **Complete OAuth Implementation**: Handles authorization code flow with StockX
- **Persistent Token Storage**: Securely stores tokens for long-term use
- **Automatic Token Refresh**: Refreshes tokens before they expire
- **Background Monitoring**: Continuously checks token health
- **API Proxying**: Provides authenticated access to StockX's API
- **Web Interface**: Includes a simple UI for testing and monitoring

## Getting Started

### Installation

Install the required dependencies:

```bash
npm install
```

### Configuration

The default configuration uses environment variables with fallbacks. You can customize these settings by creating a `.env` file:

```
STOCKX_CLIENT_ID=your_client_id
STOCKX_CLIENT_SECRET=your_client_secret
REDIRECT_URI=http://localhost:3000/callback
PORT=3000
TOKEN_FILE=./tokens.json
```

### Running the Server

Start the persistent OAuth server:

```bash
npm run start:persistent
```

This will start a server on port 3000 (or your configured port) with the following endpoints:

- **Web UI**: `http://localhost:3000/`
- **Status API**: `http://localhost:3000/api/auth/status`
- **Auth Init**: `http://localhost:3000/api/auth/init`
- **Callback**: `http://localhost:3000/callback`
- **API Proxy**: `http://localhost:3000/api/stockx/*`

### Authentication Flow

1. **Start Authentication**:
   - Visit the web UI at `http://localhost:3000/` and click "Start Authentication"
   - Alternatively, call `GET /api/auth/init` to get an authorization URL

2. **Complete Authorization**:
   - Log in with your StockX credentials
   - Authorize the application
   - You'll be redirected back to the callback URL

3. **Use the API**:
   - Make requests to the StockX API through the proxy endpoint
   - Example: `GET /api/stockx/v2/catalog/search?query=nike`

## Token Management

The system handles tokens automatically:

- **Initial Acquisition**: Tokens are obtained during the OAuth flow
- **Storage**: Tokens are stored in the configured file (default: `tokens.json`)
- **Auto-Refresh**: Tokens are refreshed 15 minutes before expiry
- **Background Monitoring**: Checks token health every 5 minutes
- **Fallback**: In case of refresh failure, will attempt to use existing token if still valid

## API Usage

### Status Check

```bash
curl http://localhost:3000/api/auth/status
```

Response:
```json
{
  "has_tokens": true,
  "has_access_token": true,
  "has_refresh_token": true,
  "is_valid": true,
  "is_expiring_soon": false,
  "expires_in_seconds": 86400,
  "obtained_at": 1616161616000,
  "last_refresh": 1616161616000,
  "refresh_count": 0
}
```

### Making API Requests

```bash
# Example search request
curl http://localhost:3000/api/stockx/v2/catalog/search?query=jordan

# Example product request
curl http://localhost:3000/api/stockx/v2/catalog/product/nike-dunk-low-grey-fog
```

## Deployment to Cloudflare

For production use, you can deploy this solution to Cloudflare Workers:

1. Update the `wrangler.toml` file with your configuration
2. Run the deployment script:

```bash
./deploy-cloudflare.sh
```

## Architecture

This solution uses a combination of components:

- **Express Server**: Handles HTTP requests and serves the web UI
- **OAuth Manager**: Manages the OAuth flow and token lifecycle
- **Token Storage**: Persistently stores tokens
- **Background Service**: Monitors and refreshes tokens
- **API Proxy**: Forwards authenticated requests to StockX

## Troubleshooting

### Token Refresh Issues

If you encounter token refresh issues:

1. Check the token status: `GET /api/auth/status`
2. Verify your client credentials
3. Start a new authentication flow if necessary

### API Access Issues

If you cannot access the API:

1. Ensure you have valid tokens
2. Check that the endpoint path is correct
3. Verify you have permission to access the requested resource

### Authentication Flow Issues

If the authentication flow fails:

1. Ensure your redirect URI matches your configuration
2. Check that your client credentials are correct
3. Verify that the required scopes are approved

## Security Considerations

- Store client credentials securely using environment variables
- Protect the token storage file with appropriate permissions
- Use HTTPS in production environments
- Implement rate limiting to prevent abuse

## License

This project is provided as-is without warranty. Use at your own risk.