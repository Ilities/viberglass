# OpenCode Agent Worker Image
# Extends base worker with OpenCode CLI support

ARG BASE_IMAGE=base-worker
FROM ${BASE_IMAGE} AS opencode-worker

# Install OpenCode CLI for the runtime user to avoid root-owned binary issues.
ENV NPM_CONFIG_PREFIX=/home/viberator/.npm-global
ENV PATH="/home/viberator/.npm-global/bin:/home/viberator/.local/bin:/home/viberator/.cargo/bin:${PATH}"

# Install OpenCode CLI
# Source: https://opencode.ai/docs
RUN npm install -g opencode-ai@latest

# Verify installation
RUN which opencode || echo "Warning: opencode not found in PATH"

ENV AGENT_TYPE=opencode
ENV OPENCODE_CONFIG_DIR=/tmp/opencode-config

# Add OpenCode-specific labels
LABEL agent.type="opencode" \
      agent.provider="opencode" \
      viberator.worker-type="agent"

CMD ["node", "dist/cli-worker.js", "--help"]
