FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libxcomposite1 \
    libxrandr2 \
    libxdamage1 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libxshmfence1 \
    fonts-liberation \
    libappindicator3-1 \
    xdg-utils \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY tipsats-backend/package*.json ./tipsats-backend/
COPY test-harness-twdk-spark-ln/package*.json ./test-harness-twdk-spark-ln/

WORKDIR /app/tipsats-backend
RUN npm ci --omit=dev

WORKDIR /app/test-harness-twdk-spark-ln
RUN npm ci --omit=dev
RUN npx playwright install chromium

WORKDIR /app

COPY tipsats-backend/ ./tipsats-backend/
COPY test-harness-twdk-spark-ln/ ./test-harness-twdk-spark-ln/

ENV NODE_ENV=production
ENV HEADLESS=true
ENV PORT=8080

EXPOSE 8080

CMD ["sh", "-c", "Xvfb :99 -screen 0 1280x800x24 -nolisten tcp & export DISPLAY=:99 && cd /app/tipsats-backend && node --import tsx/esm src/server.ts"]
