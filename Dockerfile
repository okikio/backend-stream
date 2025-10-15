# syntax=docker/dockerfile:1
FROM node:24-alpine as base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

ARG DATABASE_URL
ARG DATABASE_URL_DOCKER
ARG META_NAME
ARG META_DESCRIPTION
ARG CRYPTO_SECRET
ARG TMDB_API_KEY
ARG CAPTCHA=false
ARG CAPTCHA_CLIENT_KEY
ARG TRAKT_CLIENT_ID
ARG TRAKT_SECRET_ID
ARG NODE_ENV=production

ENV DATABASE_URL=${DATABASE_URL}
ENV DATABASE_URL_DOCKER=${DATABASE_URL_DOCKER}
ENV META_NAME=${META_NAME}
ENV META_DESCRIPTION=${META_DESCRIPTION}
ENV CRYPTO_SECRET=${CRYPTO_SECRET}
ENV TMDB_API_KEY=${TMDB_API_KEY}
ENV CAPTCHA=${CAPTCHA}
ENV CAPTCHA_CLIENT_KEY=${CAPTCHA_CLIENT_KEY}
ENV TRAKT_CLIENT_ID=${TRAKT_CLIENT_ID}
ENV TRAKT_SECRET_ID=${TRAKT_SECRET_ID}
ENV NODE_ENV=${NODE_ENV}

# Dependencies stage
FROM base AS deps
WORKDIR /app

# Copy only lockfile first for better caching
COPY pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm fetch --frozen-lockfile

# Copy package.json and install
COPY package.json ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline

# Build stage
FROM base AS build
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml ./

# Copy prisma schema and generate client
COPY prisma ./prisma/
RUN pnpm dlx prisma generate

# Copy source and build
COPY . .
RUN pnpm run build

# Production stage
FROM base AS production
WORKDIR /app

# Install openssl for Prisma
RUN apk add --no-cache openssl

# Copy built output and necessary files
COPY --from=build /app/.output ./.output
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json

# Set production environment
ENV NODE_ENV=production

EXPOSE 3000

# Run migrations then start server
CMD ["sh", "-c", "pnpm dlx prisma migrate deploy && node .output/server/index.mjs"]
