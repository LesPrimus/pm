#!/usr/bin/env bash
# Start the app. Mac and Linux.
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p data
docker compose up --build -d
echo "Running on http://localhost:8000"
