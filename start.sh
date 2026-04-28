#!/usr/bin/env bash
set -e

MODEL=${OLLAMA_MODEL:-qwen2.5}

echo "▶ Installing Ollama..."

curl -fsSL https://ollama.com/install.sh | sh

# ── Start Ollama ──────────────────────────────────────────────────────────────
echo "▶ Starting Ollama server..."
ollama serve &

# ── Start Node immediately so RunPod health check passes ─────────────────────
echo "🚀 Starting Node.js server..."
node server/server.js &
NODE_PID=$!

# ── Pull model in the background ──────────────────────────────────────────────
echo "⏳ Waiting for Ollama API..."
for i in $(seq 1 60); do
  if curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "✓ Ollama is up. Pulling ${MODEL}..."
    ollama pull "${MODEL}" && echo "✓ Model ready."
    break
  fi
  sleep 3
done

wait $NODE_PID