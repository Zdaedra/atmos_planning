#!/bin/bash
echo "🚀 Syncing files to remote server..."
rsync -avz --exclude 'node_modules' --exclude '.next' --exclude 'dist' lovable_frontend/ root@89.167.122.76:/root/atmos_planning/lovable_frontend/
rsync -avz --exclude 'node_modules' --exclude '.next' --exclude 'out' frontend/ root@89.167.122.76:/root/atmos_planning/frontend/
rsync -avz backend/app/ root@89.167.122.76:/root/atmos_planning/backend/app/

echo "🏗️  Rebuilding Docker containers without cache..."
ssh root@89.167.122.76 "cd /root/atmos_planning && docker compose build --no-cache backend frontend supervisor_frontend && docker compose up -d backend frontend supervisor_frontend"

echo "✅ Deployment complete!"
