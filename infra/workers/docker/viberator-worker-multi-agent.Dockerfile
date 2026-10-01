# Multi-Agent Worker Image
# Includes all supported agent CLIs for maximum flexibility

# Build stage
FROM node:24-slim AS builder
WORKDIR /app
COPY package*.json ./
COPY apps/viberator/package*.json ./apps/viberator/
COPY apps/viberator/tsup.config.ts ./apps/viberator/
COPY packages/types/ ./packages/types/
COPY packages/telemetry/ ./packages/telemetry/
COPY packages/agent-core/ ./packages/agent-core/
COPY packages/agents/ ./packages/agents/
RUN npm install --workspace=@viberator/orchestrator
COPY apps/viberator ./apps/viberator
RUN npm run build:worker

# Production stage
FROM node:24-slim
WORKDIR /app

# Install system dependencies
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

# Install ALL agent CLIs globally
# With its ACP adapter, which the worker starts (it moved from @zed-industries to @agentclientprotocol).
RUN npm install -g @anthropic-ai/claude-code @agentclientprotocol/claude-agent-acp

# Install Qwen Code CLI
# Source: https://qwenlm.github.io/qwen-code-docs/
RUN npm install -g @qwen-code/qwen-code@latest

# Install Google Gemini CLI
# Source: https://geminicli.com/docs/get-started/installation/
RUN npm install -g @google/gemini-cli

# Install OpenAI Codex CLI
# Source: https://github.com/openai/codex
RUN npm install -g @openai/codex @agentclientprotocol/codex-acp

# Install OpenCode CLI
# Source: https://opencode.ai/docs
RUN npm install -g opencode-ai@latest

# Install Pi coding agent CLI and ACP bridge
# Source: https://github.com/earendil-works/pi-coding-agent (pi-acp needs pi >= 0.81)
# Source: https://github.com/svkozak/pi-acp
RUN npm install -g @earendil-works/pi-coding-agent pi-acp

# Install Kimi Code CLI for the runtime user to avoid /root permission issues.
USER viberator
ENV PATH="/home/viberator/.kimi-code/bin:/home/viberator/.local/bin:/home/viberator/.cargo/bin:${PATH}"
# The older kimi-cli is no longer maintained and refuses to run; the installer keeps it as kimi-legacy.
RUN curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash \
    && rm -f /home/viberator/.local/bin/kimi-legacy /home/viberator/.local/bin/kimi-cli
USER root

# Install uv for Python-based tools
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    mv /root/.local/bin/uv /usr/local/bin/ || true

# Install Mistral Vibe using uv
# Source: https://docs.mistral.ai/mistral-vibe/introduction/install
# Installed as root, so outside /root: the runtime user can't reach /root/.local.
RUN UV_TOOL_DIR=/opt/uv/tools UV_TOOL_BIN_DIR=/usr/local/bin UV_PYTHON_INSTALL_DIR=/opt/uv/python uv tool install mistral-vibe || \
    pip install mistral-vibe || \
    echo "Warning: Failed to install mistral-vibe"

# Keep user-level tool paths first at runtime.
ENV PATH="/home/viberator/.kimi-code/bin:/home/viberator/.local/bin:/home/viberator/.cargo/bin:/root/.local/bin:/root/.cargo/bin:${PATH}"

# Copy package files and install production dependencies
COPY package*.json ./
COPY apps/viberator/package*.json ./apps/viberator/
COPY --from=builder /app/packages/types/ ./packages/types/
COPY --from=builder /app/packages/telemetry/ ./packages/telemetry/
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

# Multi-agent labels
LABEL agent.types="claude-code,qwen-cli,gemini-cli,mistral-vibe,codex,opencode,kimi-code,pi" \
      viberator.worker-type="multi-agent" \
      viberator.capabilities="all-agents"

CMD ["node", "apps/viberator/dist/cli-worker.js", "--help"]
