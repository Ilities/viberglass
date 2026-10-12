# Worker image with every harness in the build
# Generated: don't edit, run npm run generate:dockerfiles.

FROM node:24-slim AS builder
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

# Composed images install their harnesses here, before the app, so a code change doesn't reinstall them.
USER viberator
ENV NPM_CONFIG_PREFIX=/home/viberator/.npm-global
ENV PATH="/home/viberator/.npm-global/bin:/home/viberator/.local/bin:/home/viberator/.cargo/bin:${PATH}"

# Fragment: Claude Code agent
# Source: https://github.com/anthropics/claude-code
# The ACP adapter moved from @zed-industries (frozen at 0.23.1) to @agentclientprotocol.
RUN npm install -g @anthropic-ai/claude-code @agentclientprotocol/claude-agent-acp

RUN which claude || echo "Warning: claude not found in PATH"

# Fragment: Qwen Code CLI agent
# Source: https://qwenlm.github.io/qwen-code-docs/
RUN npm install -g @qwen-code/qwen-code@latest

RUN which qwen || echo "Warning: qwen not found in PATH"

# Fragment: OpenAI Codex agent
# Source: https://github.com/openai/codex
# codex-acp is the ACP server the worker starts (CodexAgent.getAcpServerCommand).
RUN npm install -g @openai/codex @agentclientprotocol/codex-acp

RUN which codex || echo "Warning: codex not found in PATH"

# Under $HOME, so the plugin's stateDirs (.codex) archive its sessions between turns.
ENV CODEX_HOME=/home/viberator/.codex
ENV CODEX_CONFIG_DIR=/home/viberator/.codex

# Fragment: OpenCode agent
# Source: https://opencode.ai/docs
RUN npm install -g opencode-ai@1.18.34

RUN which opencode || echo "Warning: opencode not found in PATH"

ENV OPENCODE_CONFIG_DIR=/tmp/opencode-config

# Fragment: Kimi Code agent
# Override PATH for non-npm user-local install
ENV PATH="/home/viberator/.kimi-code/bin:/home/viberator/.local/bin:/home/viberator/.cargo/bin:${PATH}"

# Kimi Code CLI. The older kimi-cli (code.kimi.com/install.sh) is no longer maintained and refuses to run.
# The global installer: code.kimi.com's downloads come from its mainland-China CDN, which runners elsewhere time out on.
# Downloaded before running, so a failed download fails the step instead of piping an empty script to bash.
RUN for attempt in 1 2 3; do \
      curl -fsSL --retry 3 https://code.kimi.ai/kimi-code/install.sh -o /tmp/kimi-install.sh && bash /tmp/kimi-install.sh && break; \
      if [ "$attempt" = 3 ]; then exit 1; fi; sleep 15; \
    done \
    && rm -f /tmp/kimi-install.sh
# The installer keeps an older kimi-cli as kimi-legacy; nothing should run it.
RUN rm -f /home/viberator/.local/bin/kimi-legacy /home/viberator/.local/bin/kimi-cli \
    && (command -v uv >/dev/null && uv tool uninstall kimi-cli >/dev/null 2>&1 || true)

RUN which kimi || echo "Warning: kimi not found in PATH"

# Fragment: Mistral Vibe agent
# Override PATH for non-npm user-local install
ENV PATH="/home/viberator/.local/bin:/home/viberator/.cargo/bin:${PATH}"

# Install uv package manager
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

# Source: https://docs.mistral.ai/mistral-vibe/introduction/install
# Pinned Python: uv picks the newest, which some of its dependencies have no wheels for yet.
RUN uv tool install --python 3.13 mistral-vibe || \
    pip install --user mistral-vibe || \
    echo "Warning: Failed to install mistral-vibe"

RUN which vibe || echo "Warning: vibe not found in PATH"

ENV MISTRAL_CONFIG_DIR=/tmp/mistral-config

# Fragment: Google Antigravity agent
# Google's ACP server for Antigravity; the worker talks to it directly.
USER root
RUN apt-get update && apt-get install -y --no-install-recommends unzip && rm -rf /var/lib/apt/lists/*
COPY packages/agents/agent-antigravity/install-acp-server.sh /tmp/install-agy-acp.sh
RUN sh /tmp/install-agy-acp.sh /opt/agy-acp && rm /tmp/install-agy-acp.sh
USER viberator
ENV PATH="/opt/agy-acp:${PATH}"

RUN which agy_acp_server.par || echo "Warning: agy_acp_server.par not found in PATH"

# Fragment: Pi coding agent
# Source: https://github.com/earendil-works/pi (pi 1.x needs Node >= 22.19)
# Source: https://github.com/svkozak/pi-acp
RUN npm install -g @earendil-works/pi-coding-agent@1.0.2 pi-acp@0.0.34

RUN which pi || echo "Warning: pi not found in PATH"

LABEL agent.types="claude-code,qwen-cli,codex,opencode,kimi-code,mistral-vibe,antigravity,pi" viberator.worker-type="multi-agent"
USER root

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

# Default command shows help
# Override this in derived images or at runtime
CMD ["node", "apps/viberator/dist/cli-worker.js", "--help"]
