# syntax=docker/dockerfile:1
# Base image with pnpm setup
FROM node:24-alpine AS base

# Enable pnpm via corepack (built into Node.js)
RUN corepack enable pnpm

# Install OpenSSL (required by Prisma on Alpine)
RUN apk add --no-cache libc6-compat openssl

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

# ============================================
# Dependencies stage
# ============================================
FROM base AS deps

# Copy dependency manifests
COPY package.json pnpm-lock.yaml .npmrc ./

# Copy Prisma schema to enable client generation
COPY prisma ./prisma/

# Install dependencies with frozen lockfile
RUN pnpm install --frozen-lockfile

# Generate Prisma Client for the Alpine environment
RUN pnpm exec prisma generate

# ============================================
# Production runner stage
# ============================================
FROM base AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy .npmrc to maintain pnpm configuration
COPY --from=deps /app/.npmrc ./.npmrc

# Copy Prisma schema (needed for migrations and generation at runtime)
COPY --from=deps /app/prisma ./prisma

# Copy application source
COPY . .

# Expose the application port
EXPOSE 3000

ENV PORT=3000
ENV HOST=0.0.0.0

# Build and start the Nitro server at runtime with environment variables
# Copy Prisma with -L to follow symlinks and copy actual content
CMD pnpm run build && \
    mkdir -p .output/server/node_modules && \
    cp -rL node_modules/.prisma .output/server/node_modules/ 2>/dev/null || true && \
    cp -rL node_modules/@prisma .output/server/node_modules/ 2>/dev/null || true && \
    cd .output/server && \
    node index.mjs