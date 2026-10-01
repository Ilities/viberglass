# Use the official AWS Lambda Node.js base image
FROM public.ecr.aws/lambda/nodejs:24 AS builder
WORKDIR /app
COPY package*.json ./
COPY apps/viberator/package*.json ./apps/viberator/
COPY packages/types/ ./packages/types/
COPY packages/telemetry/ ./packages/telemetry/
COPY packages/agent-core/ ./packages/agent-core/
COPY packages/agents/ ./packages/agents/
RUN npm install --workspace=@viberator/orchestrator
COPY apps/viberator ./apps/viberator
COPY apps/viberator/tsup.config.lambda.ts ./apps/viberator/tsup.config.ts
RUN npm run build:worker

FROM public.ecr.aws/lambda/nodejs:24

# Install git and file utilities (curl-minimal is already present in the base image)
RUN dnf install -y git findutils ca-certificates tar && dnf clean all

WORKDIR ${LAMBDA_TASK_ROOT}

# Provide common CLI build tools expected by agent tasks.
RUN npm install -g typescript

# Install all supported agent CLIs for Lambda runtime.
RUN npm install -g \
    @anthropic-ai/claude-code \
    @qwen-code/qwen-code@latest \
    @google/gemini-cli \
    @openai/codex \
    opencode-ai@latest \
    @earendil-works/pi-coding-agent \
    pi-acp \
    @agentclientprotocol/claude-agent-acp \
    @agentclientprotocol/codex-acp

# Ensure user-level CLI installs are available during subsequent build steps.
ENV PATH="/root/.kimi-code/bin:/root/.local/bin:/root/.cargo/bin:${PATH}"

# Install Kimi Code CLI (the older kimi-cli refuses to run; the installer keeps it as kimi-legacy).
RUN curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash \
    && rm -f /root/.local/bin/kimi-legacy /root/.local/bin/kimi-cli

# Install uv and Mistral Vibe CLI.
# Source: https://docs.mistral.ai/mistral-vibe/introduction/install
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    mv /root/.local/bin/uv /usr/local/bin/ || true
RUN uv tool install mistral-vibe || \
    pip install mistral-vibe || \
    echo "Warning: Failed to install mistral-vibe"

# Copy package files and install production dependencies
COPY package*.json ${LAMBDA_TASK_ROOT}/
COPY apps/viberator/package*.json ${LAMBDA_TASK_ROOT}/apps/viberator/
COPY --from=builder /app/packages/types/ ${LAMBDA_TASK_ROOT}/packages/types/
COPY --from=builder /app/packages/telemetry/ ${LAMBDA_TASK_ROOT}/packages/telemetry/
COPY --from=builder /app/packages/agent-core/ ${LAMBDA_TASK_ROOT}/packages/agent-core/
COPY --from=builder /app/packages/agents/ ${LAMBDA_TASK_ROOT}/packages/agents/
RUN npm install --omit=dev --workspace=@viberator/orchestrator

# Copy built app from builder
COPY --from=builder /app/apps/viberator/dist/lambda-handler.js ${LAMBDA_TASK_ROOT}/

# Set the CMD to your handler (filename.method)
CMD [ "lambda-handler.handler" ]
