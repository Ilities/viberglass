# Generated Dockerfile for kimi
# Do not edit manually — regenerate with: npm run generate:dockerfiles

ARG BASE_IMAGE=base-worker
FROM ${BASE_IMAGE} AS kimi-worker

ENV NPM_CONFIG_PREFIX=/home/viberator/.npm-global
ENV PATH="/home/viberator/.npm-global/bin:/home/viberator/.local/bin:/home/viberator/.cargo/bin:${PATH}"

# Fragment: Kimi Code agent
# Override PATH for non-npm user-local install
ENV PATH="/home/viberator/.local/bin:/home/viberator/.cargo/bin:${PATH}"

# Source: https://www.kimi.com/code/docs/en/kimi-cli/guides/getting-started.html
RUN curl -LsSf https://code.kimi.com/install.sh | bash

RUN which kimi || echo "Warning: kimi not found in PATH"

ENV AGENT_TYPE=kimi-code
ENV KIMI_CONFIG_DIR=/tmp/kimi-config

LABEL agent.type="kimi-code" \
      agent.provider="moonshot" \
      viberator.worker-type="agent"

CMD ["node", "apps/viberator/dist/cli-worker.js", "--help"]
