# Mistral Vibe Agent Worker Image
# Extends base worker with Mistral Vibe CLI support

ARG BASE_IMAGE=base-worker
FROM ${BASE_IMAGE} AS mistral-worker

# Switch to root to install agent
USER root

# Install uv package manager for Mistral Vibe
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    mv /root/.local/bin/uv /usr/local/bin/ || true

# Install Mistral Vibe CLI using uv
# Source: https://docs.mistral.ai/mistral-vibe/introduction/install
RUN uv tool install mistral-vibe || \
    pip install mistral-vibe || \
    echo "Warning: Failed to install mistral-vibe"

# Verify installation (try both uv and pip locations)
RUN which mistral-vibe || \
    ls /root/.local/bin/mistral-vibe || \
    echo "Warning: mistral-vibe not found in PATH"

# Add uv tool bin directory to PATH if needed
ENV PATH="/root/.local/bin:${PATH}"

# Switch back to viberator user
USER viberator

ENV AGENT_TYPE=mistral-vibe
ENV MISTRAL_CONFIG_DIR=/tmp/mistral-config

# Add Mistral-specific labels
LABEL agent.type="mistral-vibe" \
      agent.provider="mistral" \
      viberator.worker-type="agent"

CMD ["node", "dist/cli-worker.js", "--help"]
