# Qwen Agent Worker Image
# Extends base worker with Qwen CLI support

ARG BASE_IMAGE=base-worker
FROM ${BASE_IMAGE} AS qwen-worker

# Install Qwen Code CLI for the runtime user to avoid root-owned binary issues.
ENV NPM_CONFIG_PREFIX=/home/viberator/.npm-global
ENV PATH="/home/viberator/.npm-global/bin:/home/viberator/.local/bin:/home/viberator/.cargo/bin:${PATH}"

# Install Qwen Code CLI
# Source: https://qwenlm.github.io/qwen-code-docs/
RUN npm install -g @qwen-code/qwen-code@latest

# Verify installation
RUN which qwen || echo "Warning: qwen not found in PATH"

ENV AGENT_TYPE=qwen-cli
ENV QWEN_CONFIG_DIR=/tmp/qwen-config

# Add Qwen-specific labels
LABEL agent.type="qwen-cli" \
      agent.supported-modes="cli" \
      viberator.worker-type="agent"

CMD ["node", "apps/viberator/dist/cli-worker.js", "--help"]
