# Full-Stack Worker Image
# Includes all common development tools for complete project handling

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

# Install comprehensive system dependencies
RUN apt-get update && \
    apt-get install -y \
    git \
    curl \
    wget \
    ca-certificates \
    # Build tools
    build-essential \
    gcc \
    g++ \
    make \
    cmake \
    # Python ecosystem
    python3 \
    python3-pip \
    python3-venv \
    # Java
    openjdk-17-jdk \
    # Ruby
    ruby \
    ruby-dev \
    # Go
    golang \
    # Rust
    rustc \
    cargo \
    # Database clients
    postgresql-client \
    default-mysql-client \
    redis-tools \
    # Utilities
    jq \
    yq \
    gettext-base \
    zip \
    unzip \
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

# Install common Node.js tools globally
RUN npm install -g --save-optional \
    typescript \
    tsx \
    ts-node \
    eslint \
    prettier \
    jest \
    vitest \
    webpack \
    vite \
    rollup \
    pkg

# Install Python tools
RUN pip3 install --break-system-packages --no-cache-dir \
    black \
    flake8 \
    mypy \
    pylint \
    pytest \
    || pip3 install --user --no-cache-dir \
    black \
    flake8 \
    mypy \
    pylint \
    pytest

# Create a work directory for git clones
RUN mkdir -p /tmp/viberator-work && \
    chown -R viberator:viberator /tmp/viberator-work && \
    chmod 777 /tmp/viberator-work

# Set ownership for the app directory
RUN chown -R viberator:viberator /app

USER viberator

ENV NODE_ENV=production
ENV WORK_DIR=/tmp/viberator-work

# Full-stack labels
LABEL viberator.worker-type="task-fullstack" \
      viberator.capabilities="fullstack,testing,building,linting" \
      viberator.languages="javascript,typescript,python,java,ruby,go,rust" \
      viberator.tools="git,node,npm,python,pip,gem,cargo"

CMD ["node", "dist/cli-worker.js", "--help"]
