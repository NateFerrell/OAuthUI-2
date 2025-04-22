#!/bin/bash

# Deployment script for Cloudflare Pages

# Exit on any error
set -e

echo "Building application..."
npm run build

echo "Using existing KV namespace from wrangler.toml..."

echo "Preparing for deployment..."
# Create the .env file with credentials
cat > .env << EOF
STOCKX_CLIENT_ID=KlbEZjymb9OBap9a3jWlX9bIx4j4y3ks
STOCKX_CLIENT_SECRET=y2GqspIoDSgzoryXS3Ue--5i0xlXQUU09F4cqnuVgn6Szk4efqZy1qGip_EVqmqe
REDIRECT_URI=https://stockx-consignment-portal.pages.dev/callback
EOF

echo "Deploying to Cloudflare Pages..."
# Use the newer deploy command
wrangler pages deploy out --project-name=stockx-consignment-portal

echo "Setting up environment variables..."
wrangler pages env set STOCKX_CLIENT_ID "KlbEZjymb9OBap9a3jWlX9bIx4j4y3ks" --project-name=stockx-consignment-portal
wrangler pages env set STOCKX_CLIENT_SECRET "y2GqspIoDSgzoryXS3Ue--5i0xlXQUU09F4cqnuVgn6Szk4efqZy1qGip_EVqmqe" --project-name=stockx-consignment-portal
wrangler pages env set REDIRECT_URI "https://stockx-consignment-portal.pages.dev/callback" --project-name=stockx-consignment-portal

echo "Deployment completed successfully!"
echo "Your application is now available at https://stockx-consignment-portal.pages.dev"