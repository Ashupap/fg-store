
# FG Store - Production Deployment Guide

This guide details how to deploy the FG Store application to an Ubuntu Server using Docker and Docker Compose. This architecture provides isolation, easy updates, and simple data management.

## 🏗️ Architecture
-   **Application**: Next.js 16 (Node.js 18 Alpine Container)
-   **Database**: SQLite (`/app/data/fg-store.db` persisted via Docker Volume)
-   **Port**: 3000 (Internal) -> Exposed via Nginx (Recommended)

---

## 📋 Prerequisites
-   Ubuntu Server (20.04 or 22.04 LTS recommended)
-   Root or Sudo access
-   A domain name (optional, for SSL)

---

## 🚀 Step 1: Server Setup (Install Docker)

SSH into your Ubuntu server and run the following commands to install Docker and Docker Compose.

```bash
# 1. Update package list
sudo apt update
sudo apt upgrade -y

# 2. Install Docker
sudo apt install -y docker.io

# 3. Enable and Start Docker
sudo systemctl enable --now docker

# 4. Install Docker Compose (plugin)
sudo apt install -y docker-compose-plugin

# 5. Verify Installation
docker compose version
# Should output something like "Docker Compose version v2.x.x"
```

---

## 📦 Step 2: Clone Application

```bash
# 1. Navigate to home or /var/www
cd ~

# 2. Clone the repository (Replace with your actual repo URL)
git clone https://github.com/your-username/fg-store.git
cd fg-store

# 3. Configure Environment Variables
cp .env.example .env
nano .env
```

**Edit the `.env` file**:
-   Set `JWT_SECRET` to a strong random string.
-   Set `NODE_ENV=production`.

---

## 🛠️ Step 3: First Deployment

We have prepared a helper script `deploy.sh` to handle pulling, building, and restarting.

```bash
# 1. Make script executable
chmod +x deploy.sh

# 2. Run the deployment
./deploy.sh
```

Wait for the build to complete. Once finished, the app will be running on **Port 3000**.
You can verify it with:
```bash
docker compose ps
# STATUS should be "Up"
```
Access via `http://<YOUR_SERVER_IP>:3000`.

---

## 🌐 Step 4: Reverse Proxy (Nginx) & SSL

For a production grade environment (Port 80/443), use Nginx.

### 1. Install Nginx
```bash
sudo apt install -y nginx
sudo systemctl enable --now nginx
```

### 2. Configure Site
We provided an example config in `nginx.conf.example`.

```bash
# Copy example to Nginx sites
sudo cp nginx.conf.example /etc/nginx/sites-available/fg-store

# Edit the config to set your Domain
sudo nano /etc/nginx/sites-available/fg-store
# Change 'server_name your-domain.com;' to your actual IP or Domain
```

### 3. Activate Site
```bash
sudo ln -s /etc/nginx/sites-available/fg-store /etc/nginx/sites-enabled/
sudo nginx -t  # Test config
sudo systemctl restart nginx
```

### 4. SSL (HTTPS) - Optional
If you have a domain pointing to the server IP:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 🔄 Updating the App

To deploy updates in the future, simply change directory to `fg-store` and run:

```bash
./deploy.sh
```
This will:
1.  `git pull` the latest code.
2.  `docker compose build` new image.
3.  Restart the container with zero downtime (mostly).

---

## 💾 Data Backup

Your data is critical. It is stored in the `data/` directory on the host machine (mapped to container).

**To Backup:**
```bash
# Verify where the DB is
ls -l ./data

# Create a backup archive
tar -czvf fg-store-backup-$(date +%F).tar.gz ./data
```
**Recommendation**: Set up a cron job to sync this `data` folder to S3 or an external location daily.

---

## 🆘 Troubleshooting

**View Logs:**
```bash
docker compose logs -f
```

**Restart Manually:**
```bash
docker compose restart
```

**Permission Issues:**
If the app crashes with "Read-only file system", ensure the `data` folder on host is writable by the docker user.
```bash
chmod -R 777 ./data  # (Quick fix)
# Or ensure UID 1001 (NextJS user) owns it.
```
