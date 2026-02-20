# Mistral Vibe Agent Worker Image
# Extends base worker with Mistral Vibe CLI support

ARG BASE_IMAGE=base-worker
FROM ${BASE_IMAGE} AS mistral-worker

# Install Mistral tooling for the runtime user to avoid root-owned binary issues.
ENV PATH="/home/viberator/.local/bin:/home/viberator/.cargo/bin:${PATH}"

# Install uv package manager for Mistral Vibe
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

# Install Mistral Vibe CLI using uv
# Source: https://docs.mistral.ai/mistral-vibe/introduction/install
RUN uv tool install mistral-vibe || \
    pip install --user mistral-vibe || \
    echo "Warning: Failed to install mistral-vibe"

# Verify installation (try both uv and pip locations)
RUN which mistral-vibe || \
    ls /home/viberator/.local/bin/mistral-vibe || \
    echo "Warning: mistral-vibe not found in PATH"

ENV AGENT_TYPE=mistral-vibe
ENV MISTRAL_CONFIG_DIR=/tmp/mistral-config

# Add Mistral-specific labels
LABEL agent.type="mistral-vibe" \
      agent.provider="mistral" \
      viberator.worker-type="agent"

CMD ["node", "dist/cli-worker.js", "--help"]
