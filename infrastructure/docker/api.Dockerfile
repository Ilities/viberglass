FROM node:24-alpine

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache git curl bash

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY tsup.config.ts ./

RUN npm ci
RUN npm install -g tsup

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

RUN npm prune --production

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeapp -u 1001

# Change ownership of the app directory
RUN chown -R nodeapp:nodejs /app
USER nodeapp

# Expose port
EXPOSE 3000

# Start API server
CMD ["npm", "run", "start:api"]
