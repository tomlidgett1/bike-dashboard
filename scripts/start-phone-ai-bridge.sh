#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BRIDGE_DIR="$ROOT/services/twilio-openai-bridge"
LOG_DIR="$ROOT/.phone-ai-bridge"
mkdir -p "$LOG_DIR"

set -a
# shellcheck disable=SC1091
source "$ROOT/.env.local"
set +a

# --- ngrok ---
if ! pgrep -f "ngrok http 8080" >/dev/null 2>&1; then
  ngrok http 8080 --log=stdout >>"$LOG_DIR/ngrok.log" 2>&1 &
  echo "ngrok started (pid $!)"
  sleep 2
else
  echo "ngrok already running"
fi

PUBLIC_URL=""
for _ in $(seq 1 15); do
  PUBLIC_URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print([t['public_url'] for t in d.get('tunnels',[]) if t.get('proto')=='https'][0] if d.get('tunnels') else '')" 2>/dev/null || true)
  [[ -n "$PUBLIC_URL" ]] && break
  sleep 1
done

if [[ -z "$PUBLIC_URL" ]]; then
  echo "Could not read ngrok public URL — check $LOG_DIR/ngrok.log"
  exit 1
fi

echo "Public URL: $PUBLIC_URL"
export PUBLIC_BRIDGE_URL="$PUBLIC_URL"

# --- bridge ---
if lsof -ti :8080 >/dev/null 2>&1; then
  echo "Restarting bridge on :8080..."
  lsof -ti :8080 | xargs kill -9 2>/dev/null || true
  sleep 1
fi

(
  cd "$BRIDGE_DIR"
  npm run build --silent 2>/dev/null || npm run build
  export PUBLIC_BRIDGE_URL
  node dist/index.js
) >>"$LOG_DIR/bridge.log" 2>&1 &
echo "Bridge started (pid $!) — logs: $LOG_DIR/bridge.log"

sleep 2
curl -sf "http://127.0.0.1:8080/health" >/dev/null && echo "Bridge health: OK" || echo "Bridge health: FAILED"

# --- Twilio AU1 webhooks ---
if [[ -n "${TWILIO_ACCOUNT_SID:-}" && -n "${TWILIO_AUTH_TOKEN:-}" ]]; then
  PN="${PHONE_AI_NUMBER_SID:-PN2cf8be0c2b7c855b3c7fbaabc9d57264}"
  curl -sf -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" -X POST \
    "https://api.sydney.au1.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/IncomingPhoneNumbers/$PN.json" \
    -d "VoiceUrl=${PUBLIC_URL}/twiml-inbound" \
    -d "VoiceMethod=POST" \
    -d "StatusCallback=${PUBLIC_URL}/twilio/status" \
    -d "StatusCallbackMethod=POST" >/dev/null \
    && echo "Twilio AU1 webhooks updated" \
    || echo "Twilio webhook update failed (check AU1 credentials)"
fi

echo "Done. Keep this machine awake while testing calls."
