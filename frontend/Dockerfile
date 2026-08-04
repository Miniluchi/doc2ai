FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build arguments for Vite environment variables
ARG VITE_API_URL
ARG VITE_NODE_ENV=production
ARG VITE_DEFAULT_GOOGLE_CLIENT_ID
ARG VITE_DEFAULT_GOOGLE_CLIENT_SECRET
ARG VITE_DEFAULT_MICROSOFT_CLIENT_ID
ARG VITE_DEFAULT_MICROSOFT_CLIENT_SECRET
ARG VITE_DEFAULT_MICROSOFT_TENANT_ID
ARG VITE_EXPORT_PATH
ARG CONDUCTOR_WORKSPACE_NAME

# Set environment variables for build
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_NODE_ENV=${VITE_NODE_ENV}
ENV VITE_DEFAULT_GOOGLE_CLIENT_ID=${VITE_DEFAULT_GOOGLE_CLIENT_ID}
ENV VITE_DEFAULT_GOOGLE_CLIENT_SECRET=${VITE_DEFAULT_GOOGLE_CLIENT_SECRET}
ENV VITE_DEFAULT_MICROSOFT_CLIENT_ID=${VITE_DEFAULT_MICROSOFT_CLIENT_ID}
ENV VITE_DEFAULT_MICROSOFT_CLIENT_SECRET=${VITE_DEFAULT_MICROSOFT_CLIENT_SECRET}
ENV VITE_DEFAULT_MICROSOFT_TENANT_ID=${VITE_DEFAULT_MICROSOFT_TENANT_ID}
ENV VITE_EXPORT_PATH=${VITE_EXPORT_PATH}
ENV CONDUCTOR_WORKSPACE_NAME=${CONDUCTOR_WORKSPACE_NAME}

# Build the application
RUN bun run build

# Production stage
FROM nginx:alpine

# Copy built application
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 5173

# Liveness probe: nginx must serve the SPA entry point
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --spider --tries=1 http://127.0.0.1:5173/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
