#!/usr/bin/env bash
# Biscuit's neural voice from this Mac: VoiceStudio's speech API (OpenAI shape, port 3900) reached through an ngrok tunnel
# with basic auth, Kokoro on MLX as the engine. Prints the lines to put in .env.local; ./deploy.sh then tells production.
#   scripts/voice/tunnel.sh            # start VoiceStudio headless if needed, then the tunnel (foreground, Ctrl-C stops)
#   TTS_BASIC_AUTH=biscuit:<pass> scripts/voice/tunnel.sh   # reuse a password you already put in .env.local
# Needs: the VoiceStudio app installed (its runtime under ~/Library/Application Support/VoiceStudio), ngrok (brew install ngrok)
# with your authtoken added once (ngrok config add-authtoken <token>; dashboard.ngrok.com). The Mac must stay awake: caffeinate
# below keeps it so while this runs on power.
set -euo pipefail
PORT="${OMNIVOICE_PORT:-3900}"
RUNTIME="$HOME/Library/Application Support/VoiceStudio/runtime/project"
if ! curl -fsS --max-time 3 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
  [ -x "$RUNTIME/.venv/bin/python" ] || { echo "VoiceStudio runtime not found at $RUNTIME; open the VoiceStudio app once." >&2; exit 1; }
  echo "starting VoiceStudio backend on $PORT"
  (cd "$RUNTIME" && PYTHONUNBUFFERED=1 OMNIVOICE_PORT="$PORT" nohup "$RUNTIME/.venv/bin/python" -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port "$PORT" > "$HOME/Library/Logs/biscuit-voicestudio.log" 2>&1 &)
  for i in $(seq 1 150); do curl -fsS --max-time 3 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break; sleep 2; done
fi
curl -fsS --max-time 5 "http://127.0.0.1:$PORT/health" || { echo "VoiceStudio did not come up; see ~/Library/Logs/biscuit-voicestudio.log" >&2; exit 1; }
echo
# Warm the engine once so the first real line is quick.
curl -fsS --max-time 300 "http://127.0.0.1:$PORT/v1/audio/speech" -H 'content-type: application/json' \
  -d '{"model":"mlx-audio","input":"Biscuit is ready.","voice":"am_michael","response_format":"wav","language":"en"}' -o /dev/null && echo "engine warm (mlx-audio, am_michael)"
AUTH="${TTS_BASIC_AUTH:-biscuit:$(openssl rand -hex 12)}"
command -v ngrok >/dev/null || { echo "ngrok is not installed: brew install ngrok, then ngrok config add-authtoken <token>" >&2; exit 1; }
cat <<ENV

Put these in .env.local (the URL appears in ngrok's Forwarding line below), then run ./deploy.sh:
  TTS_PROVIDER=openai
  TTS_MODEL=mlx-audio
  TTS_VOICE=am_michael
  TTS_URL=https://<your-ngrok-host>/v1/audio/speech
  TTS_BASIC_AUTH=$AUTH

ENV
exec caffeinate -s ngrok http "127.0.0.1:$PORT" --basic-auth "$AUTH" --log=stdout
