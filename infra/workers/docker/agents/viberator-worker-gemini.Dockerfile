# Gemini CLI Agent Worker Image
# Extends base worker with Google Gemini CLI support

ARG BASE_IMAGE=base-worker
FROM ${BASE_IMAGE} AS gemini-worker

# Install Gemini CLI for the runtime user to avoid root-owned binary issues.
ENV NPM_CONFIG_PREFIX=/home/viberator/.npm-global
ENV PATH="/home/viberator/.npm-global/bin:/home/viberator/.local/bin:/home/viberator/.cargo/bin:${PATH}"

# Install Google Gemini CLI
# Source: https://geminicli.com/docs/get-started/installation/
RUN npm install -g @google/gemini-cli

# Verify installation
RUN which gemini || echo "Warning: gemini not found in PATH"

ENV AGENT_TYPE=gemini-cli
ENV GEMINI_CONFIG_DIR=/tmp/gemini-config

# Add Gemini-specific labels
LABEL agent.type="gemini-cli" \
      agent.provider="google" \
      viberator.worker-type="agent"

CMD ["node", "apps/viberator/dist/cli-worker.js", "--help"]
