# OpenCode Agent Worker Image
# Extends base worker with OpenCode CLI support

ARG BASE_IMAGE=base-worker
FROM ${BASE_IMAGE} AS opencode-worker

# Switch to root to install agent
USER root

# Install OpenCode CLI globally
# Source: https://opencode.ai/docs
RUN npm install -g opencode-ai@latest

# Verify installation
RUN which opencode || echo "Warning: opencode not found in PATH"

# Switch back to viberator user
USER viberator

ENV AGENT_TYPE=opencode
ENV OPENCODE_CONFIG_DIR=/tmp/opencode-config

# Add OpenCode-specific labels
LABEL agent.type="opencode" \
      agent.provider="opencode" \
      viberator.worker-type="agent"

CMD ["node", "dist/cli-worker.js", "--help"]
