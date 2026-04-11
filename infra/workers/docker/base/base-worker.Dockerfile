# Base Worker Image for Viberator Clankers
# This image provides the common foundation for all agent-specific workers

# Build stage
FROM node:24-slim AS builder
WORKDIR /app
COPY package*.json ./
COPY apps/viberator/package*.json ./apps/viberator/
COPY apps/viberator/tsup.config.ts ./apps/viberator/
COPY packages/types/ ./packages/types/
COPY packages/agent-core/ ./packages/agent-core/
COPY packages/agents/ ./packages/agents/
RUN npm install --workspace=@viberator/orchestrator
COPY apps/viberator ./apps/viberator
RUN npm run build:worker

# Production stage
FROM node:24-slim
WORKDIR /app

# Install common system dependencies
RUN apt-get update && \
    apt-get install -y \
    git \
    curl \
    wget \
    ripgrep \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Provide common CLI tools expected by agent tasks.
RUN npm install -g typescript jest

# Create a non-root user
RUN groupadd -r viberator && useradd -r -g viberator -m -s /bin/bash viberator

# Copy package files and install production dependencies
COPY package*.json ./
COPY apps/viberator/package*.json ./apps/viberator/
COPY --from=builder /app/packages/types/ ./packages/types/
COPY --from=builder /app/packages/agent-core/ ./packages/agent-core/
COPY --from=builder /app/packages/agents/ ./packages/agents/
RUN npm install --omit=dev --workspace=@viberator/orchestrator

# Copy built app from builder
COPY --from=builder /app/apps/viberator/dist ./apps/viberator/dist

# Create a work directory for git clones
RUN mkdir -p /tmp/viberator-work && \
    chown -R viberator:viberator /tmp/viberator-work && \
    chmod 777 /tmp/viberator-work

# Set ownership for the app directory
RUN chown -R viberator:viberator /app

USER viberator

ENV NODE_ENV=production
ENV WORK_DIR=/tmp/viberator-work

# Default command shows help
# Override this in derived images or at runtime
CMD ["node", "apps/viberator/dist/cli-worker.js", "--help"]
