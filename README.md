# StockX OAuth Portal

A Next.js application for StockX OAuth authentication and product search.

## Features

- OAuth 2.0 authentication with StockX
- Token validity checking (green/red status indicator)
- Automatic token refresh when expired
- Product search interface
- Ready for Vercel deployment

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

## Deployment to Vercel

1. Push your code to a Git repository
2. Import the project in Vercel
3. Deploy

## How It Works

1. When you visit the site, it checks if you have a valid StockX token (less than 4 hours old)
2. If valid (green checkmark), you're redirected to the search page
3. If invalid (red checkmark), you'll need to authenticate with StockX
4. After successful authentication, you can search for products

## Environment Variables

The application uses client ID and secret directly in the code for simplicity. For production, consider moving these values to environment variables:

```
NEXT_PUBLIC_STOCKX_CLIENT_ID=your_client_id
STOCKX_CLIENT_SECRET=your_client_secret
NEXT_PUBLIC_REDIRECT_URI=your_redirect_uri
```