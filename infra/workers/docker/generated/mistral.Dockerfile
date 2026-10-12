# Worker image for mistral-vibe
# Generated: don't edit, run npm run generate:dockerfiles.

ARG BASE_IMAGE=base-worker
FROM ${BASE_IMAGE} AS mistral-worker

ENV NPM_CONFIG_PREFIX=/home/viberator/.npm-global
ENV PATH="/home/viberator/.npm-global/bin:/home/viberator/.local/bin:/home/viberator/.cargo/bin:${PATH}"

# Fragment: Mistral Vibe agent
# Override PATH for non-npm user-local install
ENV PATH="/home/viberator/.local/bin:/home/viberator/.cargo/bin:${PATH}"

# Install uv package manager
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

# Source: https://docs.mistral.ai/mistral-vibe/introduction/install
# Pinned Python: uv picks the newest, which some of its dependencies have no wheels for yet.
RUN uv tool install --python 3.13 mistral-vibe || \
    pip install --user mistral-vibe || \
    echo "Warning: Failed to install mistral-vibe"

RUN which vibe || echo "Warning: vibe not found in PATH"

ENV MISTRAL_CONFIG_DIR=/tmp/mistral-config

ENV AGENT_TYPE=mistral-vibe
LABEL agent.type="mistral-vibe" viberator.worker-type="agent"

CMD ["node", "apps/viberator/dist/cli-worker.js", "--help"]
