# Generated Dockerfile for fake
# Do not edit manually — regenerate with: npm run generate:dockerfiles

ARG BASE_IMAGE=base-worker
FROM ${BASE_IMAGE} AS fake-worker

ENV NPM_CONFIG_PREFIX=/home/viberator/.npm-global
ENV PATH="/home/viberator/.npm-global/bin:/home/viberator/.local/bin:/home/viberator/.cargo/bin:${PATH}"

# Fragment: Fake agent (end-to-end tests only)
# Ships no CLI: the ACP server is part of @viberglass/agent-fake, already in the base image.

ENV AGENT_TYPE=fake

LABEL agent.type="fake" \
      agent.provider="none" \
      viberator.worker-type="agent"

CMD ["node", "apps/viberator/dist/cli-worker.js", "--help"]
