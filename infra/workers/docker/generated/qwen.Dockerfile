# Generated Dockerfile for qwen
# Do not edit manually — regenerate with: npm run generate:dockerfiles

ARG BASE_IMAGE=base-worker
FROM ${BASE_IMAGE} AS qwen-worker

ENV NPM_CONFIG_PREFIX=/home/viberator/.npm-global
ENV PATH="/home/viberator/.npm-global/bin:/home/viberator/.local/bin:/home/viberator/.cargo/bin:${PATH}"

# Fragment: Qwen Code CLI agent
# Source: https://qwenlm.github.io/qwen-code-docs/
RUN npm install -g @qwen-code/qwen-code@latest

RUN which qwen || echo "Warning: qwen not found in PATH"

ENV AGENT_TYPE=qwen-cli
ENV QWEN_CONFIG_DIR=/tmp/qwen-config

LABEL agent.type="qwen-cli" \
      agent.supported-modes="cli" \
      viberator.worker-type="agent"

CMD ["node", "apps/viberator/dist/cli-worker.js", "--help"]
