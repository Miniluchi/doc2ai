FROM node:18-alpine

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies and generate Prisma client
# TODO: A VERIFIER SI LE FIX pdf-parse EST TOUJOURS PERTINENT
RUN npm ci --omit=dev \
  && npx prisma generate \
  && mkdir -p /app/storage /app/temp /app/prisma /app/test/data \
  && (cp /app/node_modules/pdf-parse/test/data/05-versions-space.pdf \
  /app/test/data/ 2>/dev/null \
  || echo "%PDF-1.4 dummy" > /app/test/data/05-versions-space.pdf)

# Copy source code
COPY src ./src/

# Expose port
EXPOSE 3000

# Start the application with automatic database sync
CMD ["sh", "-c", "npx prisma db push && npm start"]
