#!/bin/bash

# MACP Deploy Script
# Usage: ./deploy.sh [server]

SERVER="root@43.140.246.228"
REMOTE_DIR="/opt/macp"
LOCAL_DIR="/Users/mac/AI/OpenCode/Multi-Agent Collaboration Platform (MACP)"

echo "=== Syncing MACP to Tencent Cloud ==="

# Sync source files (excluding node_modules, logs, etc.)
echo "Syncing source files..."
rsync -avz --exclude 'node_modules' --exclude 'dist' --exclude '*.log' --exclude '.git' \
    "$LOCAL_DIR/src/" \
    "$SERVER:$REMOTE_DIR/src/"

# Sync dashboard.html
echo "Syncing dashboard..."
rsync -avz "$LOCAL_DIR/dashboard.html" \
    "$SERVER:$REMOTE_DIR/"

# Sync package files
echo "Syncing package files..."
rsync -avz "$LOCAL_DIR/package.json" "$SERVER:$REMOTE_DIR/"
rsync -avz "$LOCAL_DIR/tsconfig.json" "$SERVER:$REMOTE_DIR/"

# Install dependencies and rebuild on server
echo "Building on server..."
ssh $SERVER "cd $REMOTE_DIR && npm install && npm run build"

# Restart service (run in background via ssh)
echo "Restarting service..."
ssh $SERVER "pkill -f 'node dist/index.js' || true; sleep 1; cd $REMOTE_DIR && nohup node dist/index.js > /var/log/macp.log 2>&1 &" &
sleep 3

echo "=== Deployed successfully ==="
