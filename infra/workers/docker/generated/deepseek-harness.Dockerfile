# Worker image for deepseek-harness
# Generated: don't edit, run npm run generate:dockerfiles.

ARG BASE_IMAGE=base-worker
FROM ${BASE_IMAGE} AS deepseek-harness-worker

ENV NPM_CONFIG_PREFIX=/home/viberator/.npm-global
ENV PATH="/home/viberator/.npm-global/bin:/home/viberator/.local/bin:/home/viberator/.cargo/bin:${PATH}"

# Fragment: DeepSeek Harness agent
# Source: https://github.com/deepseek-ai/deepseek-harness (dsh, needs Node >= 22.19)
# ACP bridge: https://github.com/openma-ai/deepseek-harness-acp (dsh-acp)
RUN npm install -g @deepseek-ai/dsh@0.2.1-rc.2 @openma/deepseek-harness-acp@0.4.40

RUN which dsh || echo "Warning: dsh not found in PATH"
RUN which dsh-acp || echo "Warning: dsh-acp not found in PATH"

ENV AGENT_TYPE=deepseek-harness
LABEL agent.type="deepseek-harness" viberator.worker-type="agent"

CMD ["node", "apps/viberator/dist/cli-worker.js", "--help"]
