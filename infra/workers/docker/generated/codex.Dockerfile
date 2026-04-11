# Generated Dockerfile for codex
# Do not edit manually — regenerate with: npm run generate:dockerfiles

ARG BASE_IMAGE=base-worker
FROM ${BASE_IMAGE} AS codex-worker

ENV NPM_CONFIG_PREFIX=/home/viberator/.npm-global
ENV PATH="/home/viberator/.npm-global/bin:/home/viberator/.local/bin:/home/viberator/.cargo/bin:${PATH}"

# Fragment: OpenAI Codex agent
# Source: https://github.com/openai/codex
RUN npm install -g @openai/codex

RUN which codex || echo "Warning: codex not found in PATH"

ENV AGENT_TYPE=codex
ENV CODEX_HOME=/tmp/codex-config
ENV CODEX_CONFIG_DIR=/tmp/codex-config

LABEL agent.type="codex" \
      agent.provider="openai" \
      viberator.worker-type="agent"

CMD ["node", "apps/viberator/dist/cli-worker.js", "--help"]
