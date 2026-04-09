# Pi Coding Agent Worker Image
# Extends base worker with @mariozechner/pi-coding-agent support

ARG BASE_IMAGE=base-worker
FROM ${BASE_IMAGE} AS pi-worker

# Install pi CLI for the runtime user to avoid root-owned binary issues.
ENV NPM_CONFIG_PREFIX=/home/viberator/.npm-global
ENV PATH="/home/viberator/.npm-global/bin:/home/viberator/.local/bin:/home/viberator/.cargo/bin:${PATH}"

# Install Pi coding agent CLI and ACP bridge
# Source: https://github.com/mariozechner/pi-coding-agent
# Source: https://github.com/svkozak/pi-acp
RUN npm install -g @mariozechner/pi-coding-agent pi-acp

# Verify installation
RUN which pi || echo "Warning: pi not found in PATH"

ENV AGENT_TYPE=pi

# Add Pi-specific labels
LABEL agent.type="pi" \
      agent.provider="mariozechner" \
      viberator.worker-type="agent"

CMD ["node", "apps/viberator/dist/cli-worker.js", "--help"]
