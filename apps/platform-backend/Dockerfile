FROM node:24-alpine

WORKDIR /app

# Copy root package files for workspace resolution
COPY package*.json ./

# Copy workspace package.json files to preserve monorepo structure
COPY packages/types/package.json ./packages/types/
COPY apps/platform-backend/package.json ./apps/platform-backend/

# Install all dependencies (workspaces will be linked properly)
RUN npm install --workspace=@viberglass/platform-backend --workspace=@viberglass/types

# Copy types package source and build it
COPY packages/types ./packages/types
RUN npm run build --workspace=@viberglass/types

# Copy the backend source code
COPY apps/platform-backend ./apps/platform-backend

WORKDIR /app/apps/platform-backend

# Expose the port defined in your server.ts
EXPOSE 3000

# Use tsx to run the server in development
CMD ["npx", "tsx", "src/server.ts"]
