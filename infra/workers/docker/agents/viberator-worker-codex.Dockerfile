# Codex Agent Worker Image
# Extends base worker with Codex CLI support

ARG BASE_IMAGE=base-worker
FROM ${BASE_IMAGE} AS codex-worker

# Install Codex CLI for the runtime user to avoid root-owned binary issues.
ENV NPM_CONFIG_PREFIX=/home/viberator/.npm-global
ENV PATH="/home/viberator/.npm-global/bin:/home/viberator/.local/bin:/home/viberator/.cargo/bin:${PATH}"

# Install OpenAI Codex CLI
# Source: https://github.com/openai/codex
RUN npm install -g @openai/codex

# Verify installation
RUN which codex || echo "Warning: codex not found in PATH"

ENV AGENT_TYPE=codex
ENV CODEX_HOME=/tmp/codex-config
ENV CODEX_CONFIG_DIR=/tmp/codex-config

# Add Codex-specific labels
LABEL agent.type="codex" \
      agent.provider="openai" \
      viberator.worker-type="agent"

CMD ["node", "apps/viberator/dist/cli-worker.js", "--help"]
