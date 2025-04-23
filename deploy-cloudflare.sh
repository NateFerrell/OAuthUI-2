#!/bin/bash

# Deployment script for Cloudflare Pages with Persistent OAuth

# Exit on any error
set -e

echo "Building application..."
npm run build

echo "Preparing static files..."
# Make sure the public directory is copied to the output directory
mkdir -p out/public
cp -r public/* out/

echo "Setting up functions..."
# Make sure the Functions directory exists
mkdir -p out/functions
# Copy the Functions correctly
cp -r functions/*.js out/functions/
cp -r functions/api out/functions/
cp functions/_routes.json out/

echo "Preparing for deployment..."
# Create the .env file with credentials
cat > .env << EOF
STOCKX_CLIENT_ID=KlbEZjymb9OBap9a3jWlX9bIx4j4y3ks
STOCKX_CLIENT_SECRET=y2GqspIoDSgzoryXS3Ue--5i0xlXQUU09F4cqnuVgn6Szk4efqZy1qGip_EVqmqe
REDIRECT_URI=https://stockx-consignment-portal.pages.dev/callback
STOCKX_API_KEY=OEgPz70FHNL5AxwwK8fJ92Uyk18knTDOdTBxPmi0
EOF

echo "Checking for required KV namespace..."
KV_ID=$(wrangler kv namespace list | grep TOKEN_STORE | awk '{print $1}')

if [ -z "$KV_ID" ]; then
  echo "Creating TOKEN_STORE KV namespace..."
  wrangler kv namespace create TOKEN_STORE
  KV_ID=$(wrangler kv namespace list | grep TOKEN_STORE | awk '{print $1}')
  
  # Update wrangler.toml with the new KV ID
  sed -i.bak "s/id = \"[^\"]*\"/id = \"$KV_ID\"/" wrangler.toml
  rm wrangler.toml.bak
else
  echo "Using existing TOKEN_STORE KV namespace with ID: $KV_ID"
fi

echo "Deploying to Cloudflare Pages..."
# Use the newer deploy command
wrangler pages deploy out --project-name=stockx-consignment-portal --commit-dirty=true

echo "Setting up environment variables..."
wrangler pages secret put STOCKX_CLIENT_ID --project-name stockx-consignment-portal
echo "KlbEZjymb9OBap9a3jWlX9bIx4j4y3ks"

wrangler pages secret put STOCKX_CLIENT_SECRET --project-name stockx-consignment-portal
echo "y2GqspIoDSgzoryXS3Ue--5i0xlXQUU09F4cqnuVgn6Szk4efqZy1qGip_EVqmqe"

wrangler pages secret put REDIRECT_URI --project-name stockx-consignment-portal
echo "https://stockx-consignment-portal.pages.dev/callback"

wrangler pages secret put STOCKX_API_KEY --project-name stockx-consignment-portal
echo "OEgPz70FHNL5AxwwK8fJ92Uyk18knTDOdTBxPmi0"

echo "Skipping storing callback HTML in KV..."
# KV storage is no longer needed with the Pages approach
# The callback.html is served directly from Pages

echo "Setting up token refresh schedule..."
# Make sure the cron trigger is set up
echo "Cron trigger is configured in wrangler.toml (every 10 minutes)"

echo "Deployment completed successfully!"
echo "Your application is now available at https://stockx-consignment-portal.pages.dev"
echo ""
echo "To initialize the OAuth flow, visit:"
echo "https://stockx-consignment-portal.pages.dev/"
echo ""
echo "API endpoints available at:"
echo "https://stockx-consignment-portal.pages.dev/api/auth/status"
echo "https://stockx-consignment-portal.pages.dev/api/stockx/[path]"