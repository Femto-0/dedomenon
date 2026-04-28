# Dockerfile.runpod
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    bash \
    tesseract-ocr \
    tesseract-ocr-eng \
    ca-certificates \
    zstd \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server/ ./server/
COPY client/ ./client/
RUN mkdir -p server/uploads

COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 3000

ENV NODE_ENV=production \
    OLLAMA_URL=http://localhost:11434 \
    OLLAMA_MODEL=qwen2.5 \
    PORT=3000

CMD ["/start.sh"]