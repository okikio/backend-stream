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
COPY package.json pnpm-lock.yaml ./

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

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nitro

# Set production environment
ENV NODE_ENV=production

# Copy node_modules from deps stage
COPY --from=deps --chown=nitro:nodejs /app/node_modules ./node_modules

# Copy Prisma schema (needed for migrations and generation at runtime)
COPY --from=deps --chown=nitro:nodejs /app/prisma ./prisma

# Copy application source
COPY --chown=nitro:nodejs . .

# Create writable directory for application data (metrics, logs, etc.)
RUN mkdir -p /app/data && chown -R nitro:nodejs /app/data

# Switch to non-root user
USER nitro

# Expose the application port
EXPOSE 3000

ENV PORT=3000
ENV HOST=0.0.0.0

# Build and start the Nitro server at runtime with environment variables
# This ensures env vars are available during the build process
CMD pnpm exec prisma generate && pnpm run build && node .output/server/index.mjs