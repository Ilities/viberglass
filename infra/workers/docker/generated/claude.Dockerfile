# Worker image for claude-code
# Generated: don't edit, run npm run generate:dockerfiles.

ARG BASE_IMAGE=base-worker
FROM ${BASE_IMAGE} AS claude-worker

ENV NPM_CONFIG_PREFIX=/home/viberator/.npm-global
ENV PATH="/home/viberator/.npm-global/bin:/home/viberator/.local/bin:/home/viberator/.cargo/bin:${PATH}"

# Fragment: Claude Code agent
# Source: https://github.com/anthropics/claude-code
# The ACP adapter moved from @zed-industries (frozen at 0.23.1) to @agentclientprotocol.
RUN npm install -g @anthropic-ai/claude-code @agentclientprotocol/claude-agent-acp

RUN which claude || echo "Warning: claude not found in PATH"

ENV AGENT_TYPE=claude-code
LABEL agent.type="claude-code" viberator.worker-type="agent"

CMD ["node", "apps/viberator/dist/cli-worker.js", "--help"]
