FROM node:18-alpine

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application source code
COPY . .

# Expose server port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]
