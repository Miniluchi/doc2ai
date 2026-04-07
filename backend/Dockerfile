FROM node:22-alpine

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Copy package files and Prisma config
COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.js ./

# Install dependencies and generate Prisma client
RUN npm ci --omit=dev \
  && npx prisma generate \
  && mkdir -p /app/storage /app/temp /app/prisma

# Copy source code
COPY src ./src/

# Expose port
EXPOSE 3000

# Start the application with automatic database sync
CMD ["sh", "-c", "npx prisma db push && npm start"]
