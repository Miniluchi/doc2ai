FROM node:18-alpine

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --omit=dev

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Create necessary directories
RUN mkdir -p /app/storage /app/temp /app/prisma

# Fix pdf-parse debug mode by creating the test file it expects
RUN mkdir -p /app/test/data
RUN cp /app/node_modules/pdf-parse/test/data/05-versions-space.pdf /app/test/data/ 2>/dev/null || echo "Test file not found, creating dummy" && echo "%PDF-1.4 dummy" > /app/test/data/05-versions-space.pdf

# Expose port
EXPOSE 3000

# Start the application with automatic database sync
CMD ["sh", "-c", "npx prisma db push && npm start"]
