#!/bin/bash

# Temporary deployment script to fix OAuth flow

# Exit on any error
set -e

echo "Preparing static files..."
# Make sure the output directory exists
mkdir -p out
# Make sure the public directory is copied to the output directory
cp -r public/* out/

echo "Setting up functions..."
# Make sure the Functions directory exists
mkdir -p out/functions
# Copy the Functions correctly
cp -r functions/*.js out/functions/
cp -r functions/api out/functions/
cp functions/_routes.json out/

echo "Checking for required KV namespace..."
KV_ID=$(wrangler kv namespace list | grep TOKEN_STORE | awk '{print $1}')

if [ -z "$KV_ID" ]; then
  echo "Creating TOKEN_STORE KV namespace..."
  wrangler kv namespace create TOKEN_STORE
  KV_ID=$(wrangler kv namespace list | grep TOKEN_STORE | awk '{print $1}')
else
  echo "Using existing TOKEN_STORE KV namespace with ID: $KV_ID"
fi

echo "Deploying to Cloudflare Pages..."
# Use the newer deploy command
wrangler pages deploy out --project-name=stockx-consignment-portal --commit-dirty=true

echo "Setting up environment variables..."
wrangler pages secret put STOCKX_CLIENT_ID --project-name=stockx-consignment-portal <<< "KlbEZjymb9OBap9a3jWlX9bIx4j4y3ks"
wrangler pages secret put STOCKX_CLIENT_SECRET --project-name=stockx-consignment-portal <<< "y2GqspIoDSgzoryXS3Ue--5i0xlXQUU09F4cqnuVgn6Szk4efqZy1qGip_EVqmqe"
wrangler pages secret put REDIRECT_URI --project-name=stockx-consignment-portal <<< "https://stockx-consignment-portal.pages.dev/callback"
wrangler pages secret put STOCKX_API_KEY --project-name=stockx-consignment-portal <<< "OEgPz70FHNL5AxwwK8fJ92Uyk18knTDOdTBxPmi0"

echo "Storing callback HTML in KV..."
# Store the callback.html in KV for the callback function to use
wrangler kv key put "callback.html" --path="./public/callback.html" --namespace-id="$KV_ID" --remote

echo "Deployment completed successfully!"
echo "Your application is now available at https://stockx-consignment-portal.pages.dev"
echo ""
echo "To initialize the OAuth flow, visit:"
echo "https://stockx-consignment-portal.pages.dev/"
echo ""
echo "API endpoints available at:"
echo "https://stockx-consignment-portal.pages.dev/api/auth/status"
echo "https://stockx-consignment-portal.pages.dev/api/stockx/[path]"