#!/bin/bash
# Deploy Atmos Planning to Hetzner.
#
# Resolves to its own directory first so it works regardless of the caller's CWD —
# the previous version silently rsync'd from the wrong path when invoked from
# backend/ (or anywhere else).
set -euo pipefail
cd "$(dirname "$0")"

REMOTE="root@89.167.122.76"
REMOTE_ROOT="/root/atmos_planning"

echo "🚀 Syncing files to remote server..."

# Frontends — full tree
rsync -avz --exclude 'node_modules' --exclude '.next' --exclude 'dist' \
    lovable_frontend/ "${REMOTE}:${REMOTE_ROOT}/lovable_frontend/"
rsync -avz --exclude 'node_modules' --exclude '.next' --exclude 'out' \
    frontend/ "${REMOTE}:${REMOTE_ROOT}/frontend/"

# Backend — src + build inputs. requirements.txt and Dockerfile were missing before,
# causing image rebuilds to silently use stale deps.
rsync -avz --exclude '__pycache__' --exclude '*.pyc' \
    backend/app/ "${REMOTE}:${REMOTE_ROOT}/backend/app/"
rsync -avz \
    backend/requirements.txt backend/Dockerfile \
    "${REMOTE}:${REMOTE_ROOT}/backend/"

# AI monitor — separate container, deploy.sh didn't touch it previously so we kept
# missing tick code. Sync + rebuild it alongside the rest.
rsync -avz --exclude '__pycache__' --exclude '*.pyc' \
    ai_monitor/ "${REMOTE}:${REMOTE_ROOT}/ai_monitor/"

echo "🏗️  Rebuilding Docker containers without cache..."
ssh "${REMOTE}" "cd ${REMOTE_ROOT} && \
    docker compose build --no-cache backend frontend supervisor_frontend ai_monitor && \
    docker compose up -d backend frontend supervisor_frontend ai_monitor"

echo "✅ Deployment complete!"
