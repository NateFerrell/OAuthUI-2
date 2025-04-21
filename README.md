# StockX Consignment Portal with Server-Side Authentication

A Next.js application for StockX OAuth authentication and consignment inventory management, featuring server-side authentication and automatic data loading.

## Features

- **Server-Side Authentication**
  - OAuth tokens managed on the server
  - Background token refresh
  - No client-side token handling required
  - API proxy to use server-side tokens

- **Auto-Loading Data**
  - Trending products loaded automatically
  - No manual search required on initial load
  - Seamless user experience

- **Consignment Management**
  - Add products with specific sizes, quantities, and prices
  - Review and edit consignment items
  - Submit consignment inventory

- **Responsive Design**
  - Works on all device sizes
  - Clean, intuitive UI

## Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│                 │         │                 │         │                 │
│  Client         │         │  Server         │         │  StockX API     │
│  (Next.js)      │ ───────▶│  (Node.js)      │ ───────▶│                 │
│                 │         │                 │         │                 │
└─────────────────┘         └─────────────────┘         └─────────────────┘
       ▲                          │
       │                          │
       └──────────────────────────┘
                API Proxy
```

## Implementation Details

- **Token Manager**: Server-side service for managing OAuth tokens
- **API Proxy**: Routes that use server tokens to call StockX APIs
- **Caching Layer**: In-memory cache for API responses
- **Background Refresh**: Scheduled job to refresh tokens before expiration

## Development

```bash
# Install dependencies
npm install

# Run development server (client-side only)
npm run dev

# Run custom server with token management
npm run start:custom
```

## Deployment Options

### Vercel Deployment

```bash
# Build the application
npm run build

# Deploy to Vercel
vercel
```

### Cloudflare Deployment

```bash
# Install Cloudflare Wrangler
npm install -g wrangler

# Configure Cloudflare KV namespace
wrangler kv:namespace create TOKEN_STORE
# Update wrangler.toml with your KV namespace ID

# Deploy to Cloudflare Pages
wrangler pages publish .next
```

## Roadmap

1. Server-Side Authentication (Complete)
2. Auto-Loading UI (Complete)
3. Enhanced Consignment Features (In Progress)
4. Cloudflare Integration (Planned)
5. Advanced Analytics (Planned)

## Environment Variables

For production deployment, use environment variables:

```
STOCKX_CLIENT_ID=your_client_id
STOCKX_CLIENT_SECRET=your_client_secret
REDIRECT_URI=your_redirect_uri
```