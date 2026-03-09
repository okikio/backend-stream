# syntax=docker/dockerfile:1.9
# ─────────────────────────────────────────────────────────────
# Multi-stage build: dependencies → build → production runtime
# ─────────────────────────────────────────────────────────────
FROM node:24-alpine AS deps
WORKDIR /app

# Install curl for healthchecks
RUN apk add --no-cache curl

COPY package*.json ./
# Use npm ci for reproducible installs; omit dev dependencies in prod layer
RUN npm ci --ignore-scripts

# ─── build stage ──────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build arguments used during the build step (not baked into the final image)
ARG META_NAME
ARG META_DESCRIPTION
# CAPTCHA is feature-flagged; CAPTCHA_CLIENT_KEY is a public browser-facing site key
ARG CAPTCHA=false
ARG CAPTCHA_CLIENT_KEY

ENV META_NAME=${META_NAME} \
    META_DESCRIPTION=${META_DESCRIPTION} \
    CAPTCHA=${CAPTCHA} \
    CAPTCHA_CLIENT_KEY=${CAPTCHA_CLIENT_KEY}

RUN npm run build

# ─── production image ─────────────────────────────────────────
FROM node:24-alpine AS runner
WORKDIR /app

# Install curl for Coolify / health-check probes
RUN apk add --no-cache curl

ENV NODE_ENV=production

# Copy compiled output and runtime dependencies
COPY --from=builder /app/.output ./.output
COPY --from=deps    /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy migration files and the migration runner script
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts ./scripts

# OCI / Docker Hub image labels (populated by docker/metadata-action)
ARG LABEL_CREATED
ARG LABEL_VERSION
ARG LABEL_REVISION
LABEL org.opencontainers.image.created="${LABEL_CREATED}" \
      org.opencontainers.image.version="${LABEL_VERSION}" \
      org.opencontainers.image.revision="${LABEL_REVISION}" \
      org.opencontainers.image.source="https://github.com/okikio/backend-stream" \
      org.opencontainers.image.title="p-stream backend" \
      org.opencontainers.image.description="Self-hostable movie/TV streaming backend"

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -sf http://localhost:3000/ || exit 1

# Runtime secrets are supplied via Docker secrets or environment variables.
# Required at runtime: DATABASE_URL, CRYPTO_SECRET
# Optional:           META_NAME, META_DESCRIPTION, TMDB_API_KEY,
#                     CAPTCHA, CAPTCHA_CLIENT_KEY, TRAKT_CLIENT_ID, TRAKT_SECRET_ID
#
# Docker secret support: mount DATABASE_URL as /run/secrets/database_url
# and CRYPTO_SECRET as /run/secrets/crypto_secret, then set the env vars
# to reference them, e.g. via a wrapper entrypoint.
CMD ["sh", "-c", "node scripts/migrate.mjs && node .output/server/index.mjs"]
