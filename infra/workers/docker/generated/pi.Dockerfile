# Generated Dockerfile for pi
# Do not edit manually — regenerate with: npm run generate:dockerfiles

ARG BASE_IMAGE=base-worker
FROM ${BASE_IMAGE} AS pi-worker

ENV NPM_CONFIG_PREFIX=/home/viberator/.npm-global
ENV PATH="/home/viberator/.npm-global/bin:/home/viberator/.local/bin:/home/viberator/.cargo/bin:${PATH}"

# Fragment: Pi coding agent
# Source: https://github.com/mariozechner/pi-coding-agent
# Source: https://github.com/svkozak/pi-acp
RUN npm install -g @mariozechner/pi-coding-agent pi-acp

RUN which pi || echo "Warning: pi not found in PATH"

ENV AGENT_TYPE=pi

LABEL agent.type="pi" \
      agent.provider="mariozechner" \
      viberator.worker-type="agent"

CMD ["node", "apps/viberator/dist/cli-worker.js", "--help"]
