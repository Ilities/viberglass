# Lambda Worker Image
# The template the Lambda worker image is composed from; npm run generate:dockerfiles adds
# each harness's Dockerfile.lambda.fragment at the marker below.

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
# HARNESS INSTALLS

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

CMD [ "lambda-handler.handler" ]
