# Worker image for codex
# Generated: don't edit, run npm run generate:dockerfiles.

ARG BASE_IMAGE=base-worker
FROM ${BASE_IMAGE} AS codex-worker

ENV NPM_CONFIG_PREFIX=/home/viberator/.npm-global
ENV PATH="/home/viberator/.npm-global/bin:/home/viberator/.local/bin:/home/viberator/.cargo/bin:${PATH}"

# Fragment: OpenAI Codex agent
# Source: https://github.com/openai/codex
# codex-acp is the ACP server the worker starts (CodexAgent.getAcpServerCommand).
RUN npm install -g @openai/codex @agentclientprotocol/codex-acp

RUN which codex || echo "Warning: codex not found in PATH"

# Under $HOME, so the plugin's stateDirs (.codex) archive its sessions between turns.
ENV CODEX_HOME=/home/viberator/.codex
ENV CODEX_CONFIG_DIR=/home/viberator/.codex

ENV AGENT_TYPE=codex
LABEL agent.type="codex" viberator.worker-type="agent"

CMD ["node", "apps/viberator/dist/cli-worker.js", "--help"]
