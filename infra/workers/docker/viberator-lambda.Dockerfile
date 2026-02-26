# Use the official AWS Lambda Node.js base image
FROM public.ecr.aws/lambda/nodejs:24 AS builder
WORKDIR /app
COPY package*.json ./
COPY apps/viberator/package*.json ./apps/viberator/
COPY packages/types/package*.json ./packages/types/
RUN npm install --workspace=@viberator/orchestrator --workspace=@viberglass/types
COPY apps/viberator ./apps/viberator
COPY packages/types ./packages/types
COPY apps/viberator/tsup.config.lambda.ts ./apps/viberator/tsup.config.ts
RUN npm run build --workspace=@viberglass/types && \
    npm run build --workspace=@viberator/orchestrator

FROM public.ecr.aws/lambda/nodejs:24

# Install git and file utilities (curl-minimal is already present in the base image)
RUN dnf install -y git findutils ca-certificates tar && dnf clean all

WORKDIR ${LAMBDA_TASK_ROOT}

# Copy package files required for workspace dependency installation
COPY package*.json ${LAMBDA_TASK_ROOT}/
COPY apps/viberator/package*.json ${LAMBDA_TASK_ROOT}/apps/viberator/
COPY packages/types/package*.json ${LAMBDA_TASK_ROOT}/packages/types/

# Provide common CLI build tools expected by agent tasks.
RUN npm install -g typescript

# Install all supported agent CLIs for Lambda runtime.
RUN npm install -g \
    @anthropic-ai/claude-code \
    @qwen-code/qwen-code@latest \
    @google/gemini-cli \
    @openai/codex \
    opencode-ai@latest

# Ensure user-level CLI installs are available during subsequent build steps.
ENV PATH="/root/.local/bin:/root/.cargo/bin:${PATH}"

# Install Kimi Code CLI.
# Source: https://www.kimi.com/code/docs/en/kimi-cli/guides/getting-started.html
RUN curl -LsSf https://code.kimi.com/install.sh | bash

# Install uv and Mistral Vibe CLI.
# Source: https://docs.mistral.ai/mistral-vibe/introduction/install
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    mv /root/.local/bin/uv /usr/local/bin/ || true
RUN uv tool install mistral-vibe || \
    pip install mistral-vibe || \
    echo "Warning: Failed to install mistral-vibe"

# Install production dependencies
RUN npm install --omit=dev --workspace=@viberator/orchestrator --workspace=@viberglass/types

# Copy built files
COPY --from=builder /app/apps/viberator/dist/lambda-handler.js ${LAMBDA_TASK_ROOT}/
COPY --from=builder /app/packages/types/dist ${LAMBDA_TASK_ROOT}/packages/types/dist

# Set the CMD to your handler (filename.method)
CMD [ "lambda-handler.handler" ]
