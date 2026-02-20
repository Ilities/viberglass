# Kimi Code Agent Worker Image
# Extends base worker with Kimi Code CLI support

ARG BASE_IMAGE=base-worker
FROM ${BASE_IMAGE} AS kimi-worker

# Switch to root to install agent
USER root

# Install Kimi Code CLI
# Source: https://www.kimi.com/code/docs/en/kimi-cli/guides/getting-started.html
RUN curl -LsSf https://code.kimi.com/install.sh | bash

# Ensure installed binary path is available
ENV PATH="/root/.cargo/bin:${PATH}"

# Verify installation
RUN which kimi || echo "Warning: kimi not found in PATH"

# Switch back to viberator user
USER viberator

ENV AGENT_TYPE=kimi-code
ENV KIMI_CONFIG_DIR=/tmp/kimi-config

# Add Kimi-specific labels
LABEL agent.type="kimi-code" \
      agent.provider="moonshot" \
      viberator.worker-type="agent"

CMD ["node", "dist/cli-worker.js", "--help"]
