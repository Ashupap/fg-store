
#!/bin/bash

# Stop script on error
set -e

echo "========================================"
echo "🚀 FG Store - Automated Deployment"
echo "========================================"

# 1. Pull latest code
echo "📥 Pulling latest changes from Git..."
git pull origin main || { echo "❌ Git pull failed"; exit 1; }

# 2. Check for .env
if [ -f src/.env ]; then
    echo "⚠️  Found .env in src directory. Copying to root..."
    cp src/.env .env
elif [ ! -f .env ]; then
    echo "⚠️  .env file not found! Copying from .env.example..."
    cp .env.example .env
    echo "❗ Please update .env with real secrets before proceeding."
fi

# 3. Build and Start Containers
echo "🔄 Rebuilding and restarting application..."
docker compose up -d --build remove-orphans

# 4. Cleanup
echo "🧹 Cleaning up old docker images..."
docker image prune -f

echo "========================================"
echo "✅ Deployment Successful!"
echo "   App is running at http://localhost:3000"
echo "   Data is persisted in ./data directory"
echo "========================================"
