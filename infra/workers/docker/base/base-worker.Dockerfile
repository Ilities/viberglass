# Base Worker Image for Viberator Clankers
# This image provides the common foundation for all agent-specific workers

# Build stage
FROM node:24-slim AS builder
WORKDIR /app
COPY apps/viberator/package*.json ./
COPY apps/viberator/tsup.config.ts ./
RUN npm install && npm install -g tsup
COPY apps/viberator/. .
RUN npm run build

# Production stage
FROM node:24-slim
WORKDIR /app

# Install common system dependencies
RUN apt-get update && \
    apt-get install -y \
    git \
    curl \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user
RUN groupadd -r viberator && useradd -r -g viberator -m -s /bin/bash viberator

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Copy package files
COPY apps/viberator/package*.json ./

# Install production dependencies (without agents)
RUN npm install --omit=dev

# Create a work directory for git clones
RUN mkdir -p /tmp/viberator-work && \
    chown -R viberator:viberator /tmp/viberator-work && \
    chmod 777 /tmp/viberator-work

# Set ownership for the app directory
RUN chown -R viberator:viberator /app

USER viberator

ENV NODE_ENV=production
ENV WORK_DIR=/tmp/viberator-work

# Default command shows help
# Override this in derived images or at runtime
CMD ["node", "dist/cli-worker.js", "--help"]
