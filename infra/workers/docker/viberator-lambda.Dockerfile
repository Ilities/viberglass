# Lambda worker image with every harness in the build that runs on Lambda
# Generated: don't edit, run npm run generate:dockerfiles.

FROM public.ecr.aws/lambda/nodejs:24 AS builder
WORKDIR /app
COPY package*.json ./
COPY apps/viberator/package*.json ./apps/viberator/
COPY packages/types/ ./packages/types/
COPY packages/telemetry/ ./packages/telemetry/
COPY packages/agent-core/ ./packages/agent-core/
COPY packages/agents/ ./packages/agents/
COPY viberglass.plugins.json ./
COPY scripts/plugins/ ./scripts/plugins/
RUN npm install --workspace=@viberator/orchestrator
COPY apps/viberator ./apps/viberator
COPY apps/viberator/tsup.config.lambda.ts ./apps/viberator/tsup.config.ts
RUN npm run build:worker

FROM public.ecr.aws/lambda/nodejs:24

# Install git and file utilities (curl-minimal is already present in the base image)
RUN dnf install -y git findutils ca-certificates tar unzip && dnf clean all

WORKDIR ${LAMBDA_TASK_ROOT}

# Provide common CLI build tools expected by agent tasks.
RUN npm install -g typescript

# Harnesses install as root; keep user-level install dirs on PATH.
ENV PATH="/root/.local/bin:/root/.cargo/bin:${PATH}"

# Harnesses install here, before the app, so a code change doesn't reinstall them.
# Lambda fragment: Claude Code agent (Amazon Linux, as root)
RUN npm install -g @anthropic-ai/claude-code @agentclientprotocol/claude-agent-acp

# Lambda fragment: Qwen Code CLI agent (Amazon Linux, as root)
RUN npm install -g @qwen-code/qwen-code@latest

# Lambda fragment: OpenCode agent (Amazon Linux, as root)
RUN npm install -g opencode-ai@1.18.34

# Lambda fragment: Kimi Code agent (Amazon Linux, as root)
ENV PATH="/root/.kimi-code/bin:${PATH}"
# The installer keeps the older kimi-cli as kimi-legacy, which refuses to run.
# The global installer: code.kimi.com's downloads come from its mainland-China CDN, which runners elsewhere time out on.
# Downloaded before running, so a failed download fails the step instead of piping an empty script to bash.
RUN for attempt in 1 2 3; do \
      curl -fsSL --retry 3 https://code.kimi.ai/kimi-code/install.sh -o /tmp/kimi-install.sh && bash /tmp/kimi-install.sh && break; \
      if [ "$attempt" = 3 ]; then exit 1; fi; sleep 15; \
    done \
    && rm -f /tmp/kimi-install.sh \
    && rm -f /root/.local/bin/kimi-legacy /root/.local/bin/kimi-cli

# Lambda fragment: Mistral Vibe agent (Amazon Linux, as root)
# Source: https://docs.mistral.ai/mistral-vibe/introduction/install
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    mv /root/.local/bin/uv /usr/local/bin/ || true
# Pinned Python: uv picks the newest, which some of its dependencies have no wheels for yet.
RUN uv tool install --python 3.13 mistral-vibe || \
    pip install mistral-vibe || \
    echo "Warning: Failed to install mistral-vibe"

# Lambda fragment: Google Antigravity agent (Amazon Linux, as root)
COPY packages/agents/agent-antigravity/install-acp-server.sh /tmp/install-agy-acp.sh
RUN sh /tmp/install-agy-acp.sh /opt/agy-acp && rm /tmp/install-agy-acp.sh
ENV PATH="/opt/agy-acp:${PATH}"

# Lambda fragment: Pi coding agent (Amazon Linux, as root)
RUN npm install -g @earendil-works/pi-coding-agent@1.0.2 pi-acp@0.0.34

# Lambda fragment: DeepSeek Harness agent (Amazon Linux, as root)
RUN npm install -g @deepseek-ai/dsh@0.2.1-rc.2 @openma/deepseek-harness-acp@0.4.40


# Copy package files and install production dependencies
COPY package*.json ${LAMBDA_TASK_ROOT}/
COPY apps/viberator/package*.json ${LAMBDA_TASK_ROOT}/apps/viberator/
COPY --from=builder /app/packages/types/ ${LAMBDA_TASK_ROOT}/packages/types/
COPY --from=builder /app/packages/telemetry/ ${LAMBDA_TASK_ROOT}/packages/telemetry/
COPY --from=builder /app/packages/agent-core/ ${LAMBDA_TASK_ROOT}/packages/agent-core/
COPY --from=builder /app/packages/agents/ ${LAMBDA_TASK_ROOT}/packages/agents/
RUN npm install --omit=dev --workspace=@viberator/orchestrator

# Copy built app from builder
COPY --from=builder /app/apps/viberator/dist/lambda-handler.js /app/apps/viberator/dist/ask-human-mcp.js ${LAMBDA_TASK_ROOT}/

# Only /tmp is writable on Lambda.
ENV HOME=/tmp \
    CLAUDE_CONFIG_DIR=/tmp/config \
    NODE_ENV=production \
    LOG_FORMAT=json

CMD [ "lambda-handler.handler" ]
