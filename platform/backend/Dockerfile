FROM node:24-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the source code
COPY . .

# Expose the port defined in your server.ts
EXPOSE 3000

# Use tsx to run the server in development
CMD ["npx", "tsx", "src/server.ts"]