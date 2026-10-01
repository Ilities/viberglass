# Generated Dockerfile for kimi
# Do not edit manually — regenerate with: npm run generate:dockerfiles

ARG BASE_IMAGE=base-worker
FROM ${BASE_IMAGE} AS kimi-worker

ENV NPM_CONFIG_PREFIX=/home/viberator/.npm-global
ENV PATH="/home/viberator/.npm-global/bin:/home/viberator/.local/bin:/home/viberator/.cargo/bin:${PATH}"

# Fragment: Kimi Code agent
# Override PATH for non-npm user-local install
ENV PATH="/home/viberator/.kimi-code/bin:/home/viberator/.local/bin:/home/viberator/.cargo/bin:${PATH}"

# Kimi Code CLI. The older kimi-cli (code.kimi.com/install.sh) is no longer maintained and refuses to run.
RUN curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash
# The installer keeps an older kimi-cli as kimi-legacy; nothing should run it.
RUN rm -f /home/viberator/.local/bin/kimi-legacy /home/viberator/.local/bin/kimi-cli \
    && (command -v uv >/dev/null && uv tool uninstall kimi-cli >/dev/null 2>&1 || true)

RUN which kimi || echo "Warning: kimi not found in PATH"

ENV AGENT_TYPE=kimi-code

LABEL agent.type="kimi-code" \
      agent.provider="moonshot" \
      viberator.worker-type="agent"

CMD ["node", "apps/viberator/dist/cli-worker.js", "--help"]
