#!/bin/bash
# ================================================================
# CORNERSTONE SCHOOLS — VPS Deployment Script
# Tested on Ubuntu 22.04 LTS
# Run as root: chmod +x deploy.sh && sudo ./deploy.sh
# ================================================================
set -e

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  Cornerstone Schools — Deployment Script     ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

DOMAIN="cornerstoneschools.ug"
APP_DIR="/var/www/cornerstone"
NODE_VERSION="20"

# ── 1. System update ──────────────────────────────────────────
echo "▶ Updating system packages…"
apt-get update -y && apt-get upgrade -y

# ── 2. Install Node.js via NVM ────────────────────────────────
echo "▶ Installing Node.js ${NODE_VERSION}…"
curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
apt-get install -y nodejs

# ── 3. Install PM2 globally ───────────────────────────────────
echo "▶ Installing PM2…"
npm install -g pm2

# ── 4. Install Nginx ──────────────────────────────────────────
echo "▶ Installing Nginx…"
apt-get install -y nginx certbot python3-certbot-nginx

# ── 5. Create app directory ───────────────────────────────────
echo "▶ Setting up app directory at ${APP_DIR}…"
mkdir -p ${APP_DIR}
# Upload your project files here (via git clone, rsync, scp, etc.)
# git clone https://github.com/youruser/cornerstone.git ${APP_DIR}
# OR: rsync -avz ./cornerstone/ user@yourserver:${APP_DIR}/

# ── 6. Install backend dependencies ──────────────────────────
echo "▶ Installing backend dependencies…"
cd ${APP_DIR}/backend
npm install --production

# ── 7. Configure environment ──────────────────────────────────
echo ""
echo "⚠  ACTION REQUIRED: Configure your .env file"
echo "   cp ${APP_DIR}/backend/.env.example ${APP_DIR}/backend/.env"
echo "   nano ${APP_DIR}/backend/.env"
echo ""

# ── 8. Set up Nginx ──────────────────────────────────────────
echo "▶ Configuring Nginx…"
cp ${APP_DIR}/deploy/nginx.conf /etc/nginx/sites-available/${DOMAIN}
ln -sf /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/${DOMAIN}
rm -f /etc/nginx/sites-enabled/default

# Add rate limit zones to nginx.conf (if not present)
if ! grep -q "limit_req_zone" /etc/nginx/nginx.conf; then
cat >> /etc/nginx/nginx.conf << 'NGINX_APPEND'
# Rate limit zones — added by Cornerstone deploy script
# (Move these inside the http { } block if nginx.conf doesn't include them)
NGINX_APPEND
fi

nginx -t && systemctl reload nginx

# ── 9. SSL — Let's Encrypt ────────────────────────────────────
echo "▶ Obtaining SSL certificate for ${DOMAIN}…"
certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} --non-interactive --agree-tos \
  --email admin@${DOMAIN} --redirect

# ── 10. Start with PM2 ───────────────────────────────────────
echo "▶ Starting API server with PM2…"
cd ${APP_DIR}
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup | bash

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  ✓ Deployment complete!                      ║"
echo "║                                              ║"
echo "║  Next steps:                                 ║"
echo "║  1. Edit ${APP_DIR}/backend/.env           ║"
echo "║  2. pm2 restart cornerstone-api             ║"
echo "║  3. pm2 logs cornerstone-api                ║"
echo "║  4. Visit https://${DOMAIN}               ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
