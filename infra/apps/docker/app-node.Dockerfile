# Images for App spaces, on one base so modules compiled by the builder load in the runtime.
#   runtime: runs a release bundle, with its SQLite database replicated by Litestream.
#   builder: the runtime plus compilers and the worker, for release build jobs.
# docker build -f infra/apps/docker/app-node.Dockerfile --target runtime -t viberglass-app-runtime-node .
# docker build -f infra/apps/docker/app-node.Dockerfile --target builder -t viberglass-app-builder-node .

FROM node:24-slim AS worker-build
WORKDIR /app
COPY package*.json ./
COPY apps/viberator/package*.json ./apps/viberator/
COPY apps/viberator/tsup.config.ts ./apps/viberator/
COPY packages/types/ ./packages/types/
COPY packages/telemetry/ ./packages/telemetry/
COPY packages/agent-core/ ./packages/agent-core/
COPY packages/agents/ ./packages/agents/
COPY viberglass.plugins.json ./
COPY scripts/plugins/ ./scripts/plugins/
RUN npm install --workspace=@viberator/orchestrator
COPY apps/viberator ./apps/viberator
RUN npm run build:worker

FROM node:24-slim AS runtime
ARG LITESTREAM_VERSION=0.5.17
ARG LITESTREAM_SHA256_AMD64=cfb371176d164437ae869f8351cfde49bd1804ae71c61923f75c9cba9c9c006d
ARG LITESTREAM_SHA256_ARM64=f8ca4a050095c1efbda2c4365172e61bf9d955ea0d9ac42f448b52e51819baa5
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && case "$(dpkg --print-architecture)" in \
         amd64) arch=x86_64; sum="$LITESTREAM_SHA256_AMD64" ;; \
         arm64) arch=arm64; sum="$LITESTREAM_SHA256_ARM64" ;; \
         *) echo "Litestream has no build for $(dpkg --print-architecture)" >&2; exit 1 ;; \
       esac \
    && curl -fsSL -o /tmp/litestream.tar.gz "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-${arch}.tar.gz" \
    && echo "$sum  /tmp/litestream.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/litestream.tar.gz -C /usr/local/bin litestream \
    && rm /tmp/litestream.tar.gz
COPY infra/apps/runtime/start-release.sh /usr/local/bin/start-release
RUN chmod 755 /usr/local/bin/start-release \
    && mkdir -p /app /data \
    && chown node:node /app /data
WORKDIR /app
USER node
ENV PORT=3000
ENTRYPOINT ["/usr/local/bin/start-release"]

FROM runtime AS builder
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends git python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY apps/viberator/package*.json ./apps/viberator/
COPY --from=worker-build /app/packages/types/ ./packages/types/
COPY --from=worker-build /app/packages/telemetry/ ./packages/telemetry/
COPY --from=worker-build /app/packages/agent-core/ ./packages/agent-core/
COPY --from=worker-build /app/packages/agents/ ./packages/agents/
RUN npm install --omit=dev --workspace=@viberator/orchestrator
COPY --from=worker-build /app/apps/viberator/dist ./apps/viberator/dist
RUN mkdir -p /tmp/viberator-work \
    && chown -R node:node /app /tmp/viberator-work
USER node
ENV NODE_ENV=production
ENV WORK_DIR=/tmp/viberator-work
ENTRYPOINT []
CMD ["node", "apps/viberator/dist/cli-worker.js", "--help"]
