#!/usr/bin/env bash
# Start the app. Mac and Linux.
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p data
# So the container writes data/ as you, not as root.
export APP_UID="$(id -u)" APP_GID="$(id -g)"
docker compose up --build -d
echo "Running on http://localhost:8000"
