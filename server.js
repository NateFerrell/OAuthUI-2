/**
 * Custom Next.js Server with StockX OAuth token management
 * 
 * This server initializes the token manager and keeps tokens refreshed in the background.
 * Used for production deployments to ensure tokens are always valid.
 */

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { initServer } = require('./server/initServer');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = process.env.PORT || 3000;

// Initialize the Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Initialize the server-side services
console.log('Initializing server-side services...');
initServer();

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      // Parse the URL
      const parsedUrl = parse(req.url, true);
      
      // Let Next.js handle the request
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  }).listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});