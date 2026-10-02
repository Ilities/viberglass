# Generated Dockerfile for antigravity
# Do not edit manually — regenerate with: npm run generate:dockerfiles

ARG BASE_IMAGE=base-worker
FROM ${BASE_IMAGE} AS antigravity-worker

ENV NPM_CONFIG_PREFIX=/home/viberator/.npm-global
ENV PATH="/home/viberator/.npm-global/bin:/home/viberator/.local/bin:/home/viberator/.cargo/bin:${PATH}"

# Fragment: Google Antigravity agent
# Google's ACP server for Antigravity; the worker talks to it directly.
USER root
RUN apt-get update && apt-get install -y --no-install-recommends unzip && rm -rf /var/lib/apt/lists/*
COPY packages/agents/agent-antigravity/install-acp-server.sh /tmp/install-agy-acp.sh
RUN sh /tmp/install-agy-acp.sh /opt/agy-acp && rm /tmp/install-agy-acp.sh
USER viberator
ENV PATH="/opt/agy-acp:${PATH}"

RUN which agy_acp_server.par || echo "Warning: agy_acp_server.par not found in PATH"

ENV AGENT_TYPE=antigravity

LABEL agent.type="antigravity" \
      agent.provider="google" \
      viberator.worker-type="agent"

CMD ["node", "apps/viberator/dist/cli-worker.js", "--help"]
