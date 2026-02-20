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

# Install git (Lambda container images use Amazon Linux)
RUN dnf install -y git findutils && dnf clean all

WORKDIR ${LAMBDA_TASK_ROOT}

# Copy package files required for workspace dependency installation
COPY package*.json ${LAMBDA_TASK_ROOT}/
COPY apps/viberator/package*.json ${LAMBDA_TASK_ROOT}/apps/viberator/
COPY packages/types/package*.json ${LAMBDA_TASK_ROOT}/packages/types/

# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code

# Install production dependencies
RUN npm install --omit=dev --workspace=@viberator/orchestrator --workspace=@viberglass/types

# Copy built files
COPY --from=builder /app/apps/viberator/dist/lambda-handler.js ${LAMBDA_TASK_ROOT}/
COPY --from=builder /app/packages/types/dist ${LAMBDA_TASK_ROOT}/packages/types/dist

# Set the CMD to your handler (filename.method)
CMD [ "lambda-handler.handler" ]
