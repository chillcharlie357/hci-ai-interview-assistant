FROM node:22-slim

WORKDIR /app
RUN corepack enable

COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend/ ./
COPY scripts/setup_face_assets.sh /tmp/setup_face_assets.sh
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && FRONTEND_DIR=/app bash /tmp/setup_face_assets.sh \
    && rm -f /tmp/setup_face_assets.sh

EXPOSE 5173

CMD ["pnpm", "dev", "--host", "0.0.0.0", "--port", "5173"]
