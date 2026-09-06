#!/usr/bin/env bash
# Stop the app. Mac and Linux.
set -euo pipefail

cd "$(dirname "$0")/.."
export APP_UID="$(id -u)" APP_GID="$(id -g)"
docker compose down
echo "Stopped"
