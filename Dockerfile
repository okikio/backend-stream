# syntax=docker/dockerfile:1
FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Dependencies stage
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies with proper caching
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Build stage
FROM base AS build
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml ./

# Copy prisma schema and generate client
COPY prisma ./prisma/
RUN pnpm exec prisma generate

# Copy source and build
COPY . .
RUN pnpm run build

# Production stage
FROM base AS production
WORKDIR /app

# Install openssl for Prisma
RUN apk add --no-cache openssl

# Copy only production dependencies and built output
COPY --from=build /app/.output ./.output
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json

# Set production environment
ENV NODE_ENV=production

EXPOSE 3000

# Run migrations then start server
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node .output/server/index.mjs"]