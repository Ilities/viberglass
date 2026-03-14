# Local Docker Worker - Ephemeral CLI-based worker
# This container runs a single job and exits
# Includes all supported coding agents in a single image

# Build stage
FROM node:24-slim AS builder
WORKDIR /app
COPY package*.json ./
COPY apps/viberator/package*.json ./apps/viberator/
COPY packages/types/package*.json ./packages/types/
COPY apps/viberator/tsup.config.ts ./apps/viberator/
RUN npm install --workspace=@viberator/orchestrator --workspace=@viberglass/types
COPY apps/viberator ./apps/viberator
COPY packages/types ./packages/types
RUN npm run build --workspace=@viberglass/types && \
    npm run build --workspace=@viberator/orchestrator

# Production stage
FROM node:24-slim
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y git curl python3 python3-pip && rm -rf /var/lib/apt/lists/*

# Create a non-root user
RUN groupadd -r viberator && useradd -r -g viberator -m -s /bin/bash viberator

# Install all npm-based coding agents globally
RUN npm install -g \
    @anthropic-ai/claude-code \
    @qwen-code/qwen-code@latest \
    @google/gemini-cli \
    @openai/codex \
    opencode-ai@latest \
    typescript jest

# Switch to viberator for user-local agent installs (uv/kimi install to ~/.local/bin)
USER viberator
ENV PATH="/home/viberator/.local/bin:/home/viberator/.cargo/bin:${PATH}"

# Install uv and mistral-vibe
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
RUN uv tool install mistral-vibe || echo "Warning: Failed to install mistral-vibe"

# Install Kimi Code CLI
RUN curl -LsSf https://code.kimi.com/install.sh | bash || echo "Warning: Failed to install kimi"

# Back to root for app setup
USER root

# Copy package files required for workspace dependency installation
COPY package*.json ./
COPY apps/viberator/package*.json ./apps/viberator/
COPY packages/types/package*.json ./packages/types/
RUN npm install --omit=dev --workspace=@viberator/orchestrator --workspace=@viberglass/types

# Copy built files from builder
COPY --from=builder /app/apps/viberator/dist ./dist
COPY --from=builder /app/packages/types/dist ./packages/types/dist

# Create a work directory for git clones and set ownership
RUN mkdir -p /tmp/viberator-work && \
    chown -R viberator:viberator /tmp/viberator-work && \
    chmod 777 /tmp/viberator-work && \
    chown -R viberator:viberator /app

USER viberator

ENV NODE_ENV=production
ENV WORK_DIR=/tmp/viberator-work

# Default command shows help
CMD ["node", "dist/cli-worker.js", "--help"]
