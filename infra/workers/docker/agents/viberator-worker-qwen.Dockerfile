# Qwen Agent Worker Image
# Extends base worker with Qwen CLI support

ARG BASE_IMAGE=base-worker
FROM ${BASE_IMAGE} AS qwen-worker

# Switch to root to install agent
USER root

# Install Qwen Code CLI globally
# Source: https://qwenlm.github.io/qwen-code-docs/
RUN npm install -g @qwen-code/qwen-code@latest

# Verify installation
RUN which qwen-code || echo "Warning: qwen-code not found in PATH"

# Switch back to viberator user
USER viberator

ENV AGENT_TYPE=qwen-cli
ENV QWEN_CONFIG_DIR=/tmp/qwen-config

# Add Qwen-specific labels
LABEL agent.type="qwen-cli" \
      agent.supported-modes="cli,api" \
      viberator.worker-type="agent"

CMD ["node", "dist/cli-worker.js", "--help"]
