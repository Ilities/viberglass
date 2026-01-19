# Use the official AWS Lambda Node.js base image
FROM public.ecr.aws/lambda/nodejs:24 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install && npm install -g tsup
COPY . .
COPY tsup.config.lambda.ts ./tsup.config.ts
RUN npm run build

FROM public.ecr.aws/lambda/nodejs:24

# Install git (Lambda container images use Amazon Linux)
RUN dnf install -y git findutils && dnf clean all

# Copy built files
COPY --from=builder /app/dist/lambda-handler.js ${LAMBDA_TASK_ROOT}/
COPY --from=builder /app/package*.json ${LAMBDA_TASK_ROOT}/

# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code

# Install production dependencies
RUN npm install --omit=dev

# Set the CMD to your handler (filename.method)
CMD [ "lambda-handler.handler" ]