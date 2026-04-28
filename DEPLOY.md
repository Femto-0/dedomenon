# RunPod Deployment Guide — AI Doc Extractor

## Architecture Overview

```
┌─────────────────────────────────────────┐
│           RunPod Pod (GPU)              │
│                                         │
│  ┌────────────────┐  ┌───────────────┐  │
│  │  Node.js :3000 │→ │ Ollama :11434 │  │
│  │  Express + OCR │  │   llama3      │  │
│  └────────────────┘  └───────────────┘  │
│                                         │
│  Network Volume: /ollama-models         │
│  (Ollama model cache — survives restart)│
└─────────────────────────────────────────┘
         ↕ HTTP (RunPod proxy)
      Public HTTPS URL
```

Both services run in a **single Pod** — Ollama as a background process,
Node.js as the foreground process. This avoids cold-start model loading on
every request and keeps latency low.

---

## Why a Pod, not Serverless?

| | RunPod Pod | RunPod Serverless |
|---|---|---|
| Ollama support | ✅ Full process control | ❌ Needs custom handler wrapper |
| Model warm time | Once at startup | Every cold start (~30–120 s) |
| Billing | Per hour | Per second (but cold starts add up) |
| Best for | This app | Stateless inference functions |

For this app — which has a persistent Ollama process with loaded model weights — a **Pod with an hourly GPU** is simpler and faster.

---

## Step 1 — Build & Push the Docker Image

You need Docker installed locally and a Docker Hub account.

```bash
cd ai-doc-extractor

# Build for linux/amd64 (required for RunPod infrastructure)
docker buildx build \
  --platform linux/amd64,linux/arm64
  -t YOUR_DOCKERHUB_USERNAME/ai-doc-extractor:v1 \
  .

# Test locally (CPU-only, Ollama won't use GPU but will run)
docker run --rm -p 3000:3000 \
  -e OLLAMA_MODEL=llama3 \
  YOUR_DOCKERHUB_USERNAME/ai-doc-extractor:v1

# Push to Docker Hub
docker push YOUR_DOCKERHUB_USERNAME/ai-doc-extractor:v1
```

> **Apple Silicon (M1/M2/M3)?** The `--platform linux/amd64` flag cross-compiles
> for RunPod. Build time will be slower but the image will run correctly on RunPod.

---

## Step 2 — Create a Network Volume (for model persistence)

Ollama downloads the llama3 model (~4 GB) on first boot. Without a Network
Volume it re-downloads on every pod restart.

1. In the RunPod console → **Storage** → **Network Volumes** → **+ New Volume**
2. Name: `ollama-models`
3. Size: `20 GB` (enough for llama3 + room for other models)
4. Region: pick one close to you
5. Click **Create**

---

## Step 3 — Deploy the Pod

1. RunPod console → **Pods** → **+ Deploy**
2. Select **Custom** (not a template)

**GPU selection:**

| GPU | VRAM | llama3 (8B) | Notes |
|-----|------|-------------|-------|
| RTX 3090 | 24 GB | ✅ Comfortable | Good price/perf |
| RTX 4090 | 24 GB | ✅ Fastest | Most expensive |
| A4000 | 16 GB | ✅ Works | Good for 24/7 |
| RTX 3080 | 10 GB | ⚠️ Tight | Use `llama3:8b-q4` |

**Container settings:**

| Field | Value |
|-------|-------|
| Container Image | `YOUR_DOCKERHUB_USERNAME/ai-doc-extractor:v1` |
| Container Disk | `10 GB` |
| Volume Disk | `20 GB` |
| Volume Mount Path | `/root/.ollama` |
| Expose HTTP Port | `3000` |

> Setting the volume mount to `/root/.ollama` means Ollama uses the Network
> Volume as its model cache automatically — no extra config needed.

**Environment variables** (set in the Pod configuration):

| Variable | Value |
|----------|-------|
| `OLLAMA_MODEL` | `llama3` |
| `PORT` | `3000` |
| `NODE_ENV` | `production` |

3. Click **Deploy On-Demand**

---

## Step 4 — Access Your App

Once the pod is running:

1. In the pod card, click **Connect** → **HTTP Service [3000]**
2. RunPod gives you a public HTTPS URL like:
   `https://abc123-3000.proxy.runpod.net`
3. Open it in your browser — the app is live

> **First boot takes 2–5 minutes** while Ollama pulls the llama3 model.
> Subsequent restarts load from the Network Volume and take ~30 seconds.

---

## Step 5 — Monitor Logs

In the RunPod console → your pod → **Logs**. You should see:

```
▶ Starting Ollama server...
⏳ Waiting for Ollama to be ready...
✓ Ollama is ready.
📦 Ensuring model 'llama3' is available...
pulling manifest...
✓ Model ready.
🚀 Starting AI Doc Extractor on port 3000...
```

If you see `ECONNREFUSED` for Ollama, the model may still be loading — wait
30 seconds and retry.

---

## Cost Estimates

Pricing is approximate and varies by GPU availability.

| GPU | $/hr | 8 hrs/day, 20 days/mo |
|-----|------|-----------------------|
| RTX 3090 | ~$0.44 | ~$70/mo |
| RTX 4090 | ~$0.74 | ~$118/mo |
| A4000 | ~$0.36 | ~$58/mo |

**Tip:** Stop the pod when not in use — Network Volumes retain your model cache
and you're only charged for storage (~$0.07/GB/mo) while stopped.

---

## Switching Models

To use a different model (e.g. `mistral`, `llama3:70b`):

1. Update the `OLLAMA_MODEL` env var in pod settings
2. Restart the pod — `start.sh` will pull the new model automatically

For llama3:70b you'll need a GPU with 40+ GB VRAM (A100 or H100).

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Cannot connect to Ollama` | Model still loading — wait and refresh |
| Port 3000 not reachable | Make sure HTTP port 3000 is exposed in pod settings |
| OCR returns empty | Image resolution may be too low — use 300+ DPI scans |
| JSON parse error from LLM | Try `OLLAMA_MODEL=llama3:8b-instruct` — better instruction following |
| Out of VRAM | Switch to quantized model: `llama3:8b-q4_0` |
| Slow first upload | Model cold-start — subsequent uploads are much faster |

---

## Updating the App

```bash
# Make code changes, then:
docker build --platform linux/amd64 -f Dockerfile.runpod \
  -t YOUR_DOCKERHUB_USERNAME/ai-doc-extractor:v2 .
docker push YOUR_DOCKERHUB_USERNAME/ai-doc-extractor:v2
```

In RunPod → pod settings → update image tag to `:v2` → restart pod.
The Network Volume keeps your model cache so the restart is fast.
