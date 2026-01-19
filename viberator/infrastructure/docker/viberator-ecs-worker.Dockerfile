# ECS Worker - Ephemeral CLI-based worker for AWS ECS
# This container runs a single job and exits
# Optimized for AWS ECS with Fargate

# Build stage
FROM node:24-slim AS builder
WORKDIR /app
COPY package*.json ./
COPY tsup.config.ts ./
RUN npm install && npm install -g tsup
COPY . .
RUN npm run build

# Production stage
FROM node:24-slim
WORKDIR /app

# Install git as it's required for the GitService
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Create a non-root user
RUN groupadd -r viberator && useradd -r -g viberator -m -s /bin/bash viberator

# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code

COPY package*.json ./
RUN npm install --omit=dev

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Create a work directory for git clones and set ownership
RUN mkdir -p /tmp/viberator-work && chown -R viberator:viberator /tmp/viberator-work && chmod 777 /tmp/viberator-work

# Set ownership for the app directory
RUN chown -R viberator:viberator /app

USER viberator

ENV NODE_ENV=production
ENV WORK_DIR=/tmp/viberator-work

# Default command shows help (ECS overrides this with actual job data)
CMD ["node", "dist/cli-worker.js", "--help"]
