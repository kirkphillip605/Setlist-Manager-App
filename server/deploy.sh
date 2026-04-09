#!/usr/bin/env bash
# =============================================================
# SetlistPRO Server Deploy Script
# Run this from your LOCAL machine after making changes.
# Prerequisites: SSH key at ~/Downloads/setlistpro-key.pem
# =============================================================

set -e

EC2_HOST="ubuntu@<YOUR-EC2-IP-OR-HOSTNAME>"
KEY_PATH="~/Downloads/setlistpro-key.pem"
REMOTE_APP_DIR="/home/ubuntu/setlistpro/app"

echo "==> Syncing server code to EC2..."
rsync -avz --exclude node_modules --exclude dist \
  -e "ssh -i ${KEY_PATH}" \
  ./server/ "${EC2_HOST}:${REMOTE_APP_DIR}/server/"

echo "==> Installing dependencies and restarting app container..."
ssh -i "${KEY_PATH}" "${EC2_HOST}" << 'ENDSSH'
  cd ~/setlistpro

  # Update the docker-compose app command to run the real server
  # (only needed on first deploy — subsequent deploys just restart)
  docker compose stop app
  docker compose rm -f app

  # Rewrite the command in docker-compose.yml if it still has the placeholder
  if grep -q "tail -f /dev/null" docker-compose.yml; then
    sed -i 's|command: tail -f /dev/null|command: sh -c "cd /app/server \&\& npm install \&\& node_modules/.bin/tsx src/index.ts"|' docker-compose.yml
    echo "==> Updated docker-compose.yml command"
  fi

  docker compose up -d app
  echo "==> Waiting for app to start..."
  sleep 5
  docker compose logs app --tail=30
ENDSSH

echo ""
echo "==> Deploy complete!"
echo "    API:    https://api.setlist.kirknet.io/health"
echo "    WS:     wss://api.setlist.kirknet.io/ws"
