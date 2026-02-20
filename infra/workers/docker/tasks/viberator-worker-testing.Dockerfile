# Testing-focused Worker Image
# Includes testing frameworks and tools for test generation and execution

# Build stage
FROM node:24-slim AS builder
WORKDIR /app
COPY package*.json ./
COPY apps/viberator/package*.json ./apps/viberator/
COPY packages/types/package*.json ./packages/types/
COPY apps/viberator/tsup.config.ts ./apps/viberator/
RUN npm install --workspace=@viberator/orchestrator --workspace=@viberglass/types
COPY apps/viberator ./apps/viberator
COPY packages/types ./packages/types
RUN npm run build --workspace=@viberglass/types && \
    npm run build --workspace=@viberator/orchestrator

# Production stage
FROM node:24-slim
WORKDIR /app

# Install system dependencies including testing tools
RUN apt-get update && \
    apt-get install -y \
    git \
    curl \
    wget \
    ca-certificates \
    # Python for testing
    python3 \
    python3-pip \
    python3-venv \
    # Java for Java testing
    openjdk-17-jre \
    # Additional utilities
    jq \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user
RUN groupadd -r viberator && useradd -r -g viberator -m -s /bin/bash viberator

# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code

# Copy package files required for workspace dependency installation
COPY package*.json ./
COPY apps/viberator/package*.json ./apps/viberator/
COPY packages/types/package*.json ./packages/types/

# Install production dependencies
RUN npm install --omit=dev --workspace=@viberator/orchestrator --workspace=@viberglass/types

# Copy built files from builder
COPY --from=builder /app/apps/viberator/dist ./dist
COPY --from=builder /app/packages/types/dist ./packages/types/dist

# Install common testing frameworks globally
# JavaScript/TypeScript
RUN npm install -g --save-optional jest vitest mocha chai @types/mocha @types/chai

# Python testing
RUN pip3 install pytest pytest-cov unittest2 2>/dev/null || echo "Python testing tools optional"

# Create a work directory for git clones
RUN mkdir -p /tmp/viberator-work && \
    chown -R viberator:viberator /tmp/viberator-work && \
    chmod 777 /tmp/viberator-work

# Set ownership for the app directory
RUN chown -R viberator:viberator /app

USER viberator

ENV NODE_ENV=production
ENV WORK_DIR=/tmp/viberator-work

# Testing-specific labels
LABEL viberator.worker-type="task-testing" \
      viberator.capabilities="testing,jest,vitest,pytest" \
      viberator.frameworks="jest,vitest,mocha,pytest"

CMD ["node", "dist/cli-worker.js", "--help"]
