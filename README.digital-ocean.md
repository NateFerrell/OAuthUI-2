# Digital Ocean Deployment Guide

This guide will help you deploy the StockX OAuth service to a Digital Ocean Droplet.

## Prerequisites

- Digital Ocean account
- Domain name (optional but recommended)

## 1. Create a Droplet

1. Log in to your Digital Ocean account
2. Click "Create" > "Droplets"
3. Choose a plan:
   - Ubuntu 22.04 LTS
   - Basic Plan ($5/month is sufficient)
   - Choose a datacenter region close to your users
   - Add SSH key or password
   - Click "Create Droplet"

## 2. Set up the Droplet

SSH into your new Droplet:

```bash
ssh root@YOUR_DROPLET_IP
```

Update the system and install Docker:

```bash
apt update && apt upgrade -y
apt install -y docker.io docker-compose
systemctl enable docker
systemctl start docker
```

## 3. Deploy the Application

Clone your repository:

```bash
git clone YOUR_REPOSITORY_URL
cd Oauth
```

Edit the docker-compose.yml file to update the REDIRECT_URI with your Droplet's IP address:

```bash
nano docker-compose.yml
```

Change `REDIRECT_URI=http://YOUR_DIGITAL_OCEAN_IP:3000/callback` to your actual IP.

Build and start the application:

```bash
docker-compose up -d
```

## 4. Set up Domain Name (Optional)

If you have a domain name, you can point it to your Droplet and use it instead of the IP address:

1. Add an A record in your domain DNS settings pointing to your Droplet's IP
2. Update the REDIRECT_URI in docker-compose.yml to use your domain
3. Restart the application:
   ```bash
   docker-compose down
   docker-compose up -d
   ```

## 5. Add SSL with Nginx (Optional)

For HTTPS, you can set up Nginx as a reverse proxy with Let's Encrypt:

```bash
apt install -y nginx certbot python3-certbot-nginx
```

Create Nginx config:

```bash
nano /etc/nginx/sites-available/oauth
```

Add the following:

```
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site and get SSL certificate:

```bash
ln -s /etc/nginx/sites-available/oauth /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
certbot --nginx -d your-domain.com
```

Update the REDIRECT_URI in docker-compose.yml to use https:

```bash
docker-compose down
nano docker-compose.yml
# Update to REDIRECT_URI=https://your-domain.com/callback
docker-compose up -d
```

## Monitoring and Maintenance

View application logs:

```bash
docker-compose logs -f
```

Restart the application:

```bash
docker-compose restart
```

Update the application:

```bash
git pull
docker-compose down
docker-compose up -d --build
```

Backup tokens:

```bash
docker cp $(docker-compose ps -q oauth-server):/app/tokens.json ./tokens-backup.json
```