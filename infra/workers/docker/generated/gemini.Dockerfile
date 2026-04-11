# Generated Dockerfile for gemini
# Do not edit manually — regenerate with: npm run generate:dockerfiles

ARG BASE_IMAGE=base-worker
FROM ${BASE_IMAGE} AS gemini-worker

ENV NPM_CONFIG_PREFIX=/home/viberator/.npm-global
ENV PATH="/home/viberator/.npm-global/bin:/home/viberator/.local/bin:/home/viberator/.cargo/bin:${PATH}"

# Fragment: Gemini CLI agent
# Source: https://geminicli.com/docs/get-started/installation/
RUN npm install -g @google/gemini-cli

RUN which gemini || echo "Warning: gemini not found in PATH"

ENV AGENT_TYPE=gemini-cli
ENV GEMINI_CONFIG_DIR=/tmp/gemini-config

LABEL agent.type="gemini-cli" \
      agent.provider="google" \
      viberator.worker-type="agent"

CMD ["node", "apps/viberator/dist/cli-worker.js", "--help"]
