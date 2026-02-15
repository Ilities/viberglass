# Multi-Agent Worker Image
# Includes all supported agent CLIs for maximum flexibility

# Build stage
FROM node:24-slim AS builder
WORKDIR /app
COPY apps/viberator/package*.json ./
COPY apps/viberator/tsup.config.ts ./
RUN npm install && npm install -g tsup
COPY apps/viberator/. .
RUN npm run build

# Production stage
FROM node:24-slim
WORKDIR /app

# Install system dependencies
RUN apt-get update && \
    apt-get install -y \
    git \
    curl \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user
RUN groupadd -r viberator && useradd -r -g viberator -m -s /bin/bash viberator

# Install ALL agent CLIs globally
RUN npm install -g @anthropic-ai/claude-code

# Install Qwen Code CLI
# Source: https://qwenlm.github.io/qwen-code-docs/
RUN npm install -g @qwen-code/qwen-code@latest

# Install Google Gemini CLI
# Source: https://geminicli.com/docs/get-started/installation/
RUN npm install -g @google/gemini-cli

# Install OpenAI Codex CLI
# Source: https://github.com/openai/codex
RUN npm install -g @openai/codex

# Install Kimi Code CLI
# Source: https://moonshotai.github.io/Kimi-K2/cli/getting-started/
RUN curl -fsSL https://cli.moonshot.ai/kimi.sh | bash

# Install uv for Python-based tools
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    mv /root/.local/bin/uv /usr/local/bin/ || true

# Install Mistral Vibe using uv
# Source: https://docs.mistral.ai/mistral-vibe/introduction/install
RUN uv tool install mistral-vibe || \
    pip install mistral-vibe || \
    echo "Warning: Failed to install mistral-vibe"

# Add uv tool bin directory to PATH
ENV PATH="/root/.local/bin:/root/.cargo/bin:${PATH}"

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Copy package files
COPY apps/viberator/package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Create a work directory for git clones
RUN mkdir -p /tmp/viberator-work && \
    chown -R viberator:viberator /tmp/viberator-work && \
    chmod 777 /tmp/viberator-work

# Set ownership for the app directory
RUN chown -R viberator:viberator /app

USER viberator

ENV NODE_ENV=production
ENV WORK_DIR=/tmp/viberator-work

# Multi-agent labels
LABEL agent.types="claude-code,qwen-cli,qwen-api,gemini-cli,mistral-vibe,codex,kimi-code" \
      viberator.worker-type="multi-agent" \
      viberator.capabilities="all-agents"

CMD ["node", "dist/cli-worker.js", "--help"]
