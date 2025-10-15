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
# Builder stage
# ============================================
FROM base AS builder

WORKDIR /app

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY . .

# Build the Nitro application
# This creates an optimized standalone output in .output/
RUN pnpm run build

# Re-generate Prisma Client after build to ensure it's in the output
# This is critical because Nitro's build might bundle/move files
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

# Copy the Nitro output with embedded node_modules
COPY --from=builder --chown=nitro:nodejs /app/.output ./.output

# Copy Prisma schema (needed for migrations at runtime)
COPY --from=builder --chown=nitro:nodejs /app/prisma ./prisma

# CRITICAL: Copy the generated Prisma Client to where Nitro expects it
# Nitro bundles code into .output but Prisma Client needs to be available
COPY --from=builder --chown=nitro:nodejs /app/node_modules/.prisma ./.output/server/node_modules/.prisma
COPY --from=builder --chown=nitro:nodejs /app/node_modules/@prisma/client ./.output/server/node_modules/@prisma/client

# Switch to non-root user
USER nitro

# Expose the application port
EXPOSE 3000

ENV PORT=3000
ENV HOST=0.0.0.0

# Start the Nitro server
CMD ["node", ".output/server/index.mjs"]