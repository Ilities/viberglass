# Kimi Code Agent Worker Image
# Extends base worker with Kimi Code CLI support

ARG BASE_IMAGE=base-worker
FROM ${BASE_IMAGE} AS kimi-worker

# Install Kimi Code CLI for the runtime user so the binary remains executable
# after the image switches to non-root execution.
ENV PATH="/home/viberator/.local/bin:/home/viberator/.cargo/bin:${PATH}"

# Install Kimi Code CLI
# Source: https://www.kimi.com/code/docs/en/kimi-cli/guides/getting-started.html
RUN curl -LsSf https://code.kimi.com/install.sh | bash

# Verify installation
RUN which kimi || echo "Warning: kimi not found in PATH"

ENV AGENT_TYPE=kimi-code
ENV KIMI_CONFIG_DIR=/tmp/kimi-config

# Add Kimi-specific labels
LABEL agent.type="kimi-code" \
      agent.provider="moonshot" \
      viberator.worker-type="agent"

CMD ["node", "dist/cli-worker.js", "--help"]
