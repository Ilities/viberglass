# Deployment-focused Worker Image
# Includes deployment tools (kubectl, helm, terraform, awscli, etc.)

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

# Install system dependencies including deployment tools
RUN apt-get update && \
    apt-get install -y \
    git \
    curl \
    wget \
    ca-certificates \
    # Kubernetes tools
    && curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" \
    && install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl \
    # AWS CLI
    && curl "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o "awscliv2.zip" \
    && unzip awscliv2.zip \
    && ./aws/install \
    # Docker CLI
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null \
    && apt-get update \
    && apt-get install -y docker-ce-cli \
    # Terraform
    && wget -O- https://apt.releases.hashicorp.com/gpg | gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | tee /etc/apt/sources.list.d/hashicorp.list \
    && apt-get update \
    && apt-get install -y terraform \
    # Cleanup
    && rm -rf /var/lib/apt/lists/* \
    && rm -f awscliv2.zip kubectl

# Create a non-root user
RUN groupadd -r viberator && useradd -r -g viberator -m -s /bin/bash viberator

# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Copy package files
COPY apps/viberator/package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Install Node.js deployment tools
RUN npm install -g serverless pulumi @pulumi/aws

# Create a work directory for git clones
RUN mkdir -p /tmp/viberator-work && \
    chown -R viberator:viberator /tmp/viberator-work && \
    chmod 777 /tmp/viberator-work

# Set ownership for the app directory
RUN chown -R viberator:viberator /app

USER viberator

ENV NODE_ENV=production
ENV WORK_DIR=/tmp/viberator-work

# Deployment-specific labels
LABEL viberator.worker-type="task-deployment" \
      viberator.capabilities="deployment,kubernetes,aws,terraform" \
      viberator.tools="kubectl,helm,awscli,terraform,docker,pulumi,serverless"

CMD ["node", "dist/cli-worker.js", "--help"]
