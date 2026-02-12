# Gemini CLI Agent Worker Image
# Extends base worker with Google Gemini CLI support

ARG BASE_IMAGE=base-worker
FROM ${BASE_IMAGE} AS gemini-worker

# Switch to root to install agent
USER root

# Install Google Gemini CLI globally
# Source: https://geminicli.com/docs/get-started/installation/
RUN npm install -g @google/gemini-cli

# Verify installation
RUN which gemini || echo "Warning: gemini not found in PATH"

# Switch back to viberator user
USER viberator

ENV AGENT_TYPE=gemini-cli
ENV GEMINI_CONFIG_DIR=/tmp/gemini-config

# Add Gemini-specific labels
LABEL agent.type="gemini-cli" \
      agent.provider="google" \
      viberator.worker-type="agent"

CMD ["node", "dist/cli-worker.js", "--help"]
