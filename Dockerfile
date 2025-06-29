FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Ensure port binding
ENV PORT=3000
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]
