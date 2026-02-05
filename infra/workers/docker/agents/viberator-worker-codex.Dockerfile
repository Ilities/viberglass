# Codex Agent Worker Image
# Extends base worker with Codex CLI support

ARG BASE_IMAGE=base-worker
FROM ${BASE_IMAGE} AS codex-worker

# Switch to root to install agent
USER root

# Install OpenAI Codex CLI globally
# Source: https://github.com/openai/codex
RUN npm install -g @openai/codex

# Verify installation
RUN which codex || echo "Warning: codex not found in PATH"

# Switch back to viberator user
USER viberator

ENV AGENT_TYPE=codex
ENV CODEX_CONFIG_DIR=/tmp/codex-config

# Add Codex-specific labels
LABEL agent.type="codex" \
      agent.provider="openai" \
      viberator.worker-type="agent"

CMD ["node", "dist/cli-worker.js", "--help"]
