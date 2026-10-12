# Worker image for kimi-code
# Generated: don't edit, run npm run generate:dockerfiles.

ARG BASE_IMAGE=base-worker
FROM ${BASE_IMAGE} AS kimi-worker

ENV NPM_CONFIG_PREFIX=/home/viberator/.npm-global
ENV PATH="/home/viberator/.npm-global/bin:/home/viberator/.local/bin:/home/viberator/.cargo/bin:${PATH}"

# Fragment: Kimi Code agent
# Override PATH for non-npm user-local install
ENV PATH="/home/viberator/.kimi-code/bin:/home/viberator/.local/bin:/home/viberator/.cargo/bin:${PATH}"

# Kimi Code CLI. The older kimi-cli (code.kimi.com/install.sh) is no longer maintained and refuses to run.
# The global installer: code.kimi.com's downloads come from its mainland-China CDN, which runners elsewhere time out on.
# Downloaded before running, so a failed download fails the step instead of piping an empty script to bash.
RUN for attempt in 1 2 3; do \
      curl -fsSL --retry 3 https://code.kimi.ai/kimi-code/install.sh -o /tmp/kimi-install.sh && bash /tmp/kimi-install.sh && break; \
      if [ "$attempt" = 3 ]; then exit 1; fi; sleep 15; \
    done \
    && rm -f /tmp/kimi-install.sh
# The installer keeps an older kimi-cli as kimi-legacy; nothing should run it.
RUN rm -f /home/viberator/.local/bin/kimi-legacy /home/viberator/.local/bin/kimi-cli \
    && (command -v uv >/dev/null && uv tool uninstall kimi-cli >/dev/null 2>&1 || true)

RUN which kimi || echo "Warning: kimi not found in PATH"

ENV AGENT_TYPE=kimi-code
LABEL agent.type="kimi-code" viberator.worker-type="agent"

CMD ["node", "apps/viberator/dist/cli-worker.js", "--help"]
