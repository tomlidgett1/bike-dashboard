#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/services/twilio-openai-bridge"

if ! command -v fly >/dev/null 2>&1; then
  echo "fly CLI not installed. See https://fly.io/docs/hands-on/install-flyctl/"
  exit 1
fi

npm install
npm run build

fly deploy "$@"
