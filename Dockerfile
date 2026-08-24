# Multi-stage build for production
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S planner -u 1001

# Copy built dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
COPY public ./public

# Data directory (will be mounted as volume)
RUN mkdir -p /app/data && chown planner:nodejs /app/data

USER planner

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]