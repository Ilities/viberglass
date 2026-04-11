# Generated Dockerfile for opencode
# Do not edit manually — regenerate with: npm run generate:dockerfiles

ARG BASE_IMAGE=base-worker
FROM ${BASE_IMAGE} AS opencode-worker

ENV NPM_CONFIG_PREFIX=/home/viberator/.npm-global
ENV PATH="/home/viberator/.npm-global/bin:/home/viberator/.local/bin:/home/viberator/.cargo/bin:${PATH}"

# Fragment: OpenCode agent
# Source: https://opencode.ai/docs
RUN npm install -g opencode-ai@latest

RUN which opencode || echo "Warning: opencode not found in PATH"

ENV AGENT_TYPE=opencode
ENV OPENCODE_CONFIG_DIR=/tmp/opencode-config

LABEL agent.type="opencode" \
      agent.provider="opencode" \
      viberator.worker-type="agent"

CMD ["node", "apps/viberator/dist/cli-worker.js", "--help"]
