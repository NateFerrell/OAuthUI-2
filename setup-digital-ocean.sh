#!/bin/bash

# Setup script for Digital Ocean deployment
# This script automates the Digital Ocean deployment process

# Check if running on a Digital Ocean Droplet
if ! grep -q "DO-User" /etc/passwd 2>/dev/null; then
    echo "This script is intended to run on a Digital Ocean Droplet"
    echo "Running in local mode for testing purposes only"
fi

# Update system and install Docker
echo "Updating system and installing Docker..."
apt update
apt upgrade -y
apt install -y docker.io docker-compose git
systemctl enable docker
systemctl start docker

# Get the server's public IP address
SERVER_IP=$(curl -s http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address || echo "YOUR_DROPLET_IP")
echo "Detected server IP: $SERVER_IP"

# Update redirect URI in docker-compose.yml
echo "Updating the redirect URI in docker-compose.yml..."
sed -i "s|REDIRECT_URI=http://YOUR_DIGITAL_OCEAN_IP:3000/callback|REDIRECT_URI=http://$SERVER_IP:3000/callback|g" docker-compose.yml

# Build and start the application
echo "Building and starting the application..."
docker-compose up -d

echo "============================================"
echo "StockX OAuth service deployed successfully!"
echo "============================================"
echo "Application running at: http://$SERVER_IP:3000"
echo "OAuth callback URL: http://$SERVER_IP:3000/callback"
echo ""
echo "To view logs: docker-compose logs -f"
echo "To stop: docker-compose down"
echo "To update: git pull && docker-compose up -d --build"
echo "============================================"