# NAFA — apps/web/admin-portal
#
# Build from the REPO ROOT (needs the workspace manifests):
#
#   docker build -f infrastructure/docker/admin-portal/Dockerfile -t nafa/admin-portal:dev .

# ---------- base toolchain ----------
FROM node:22-alpine AS pnpm-base
RUN corepack enable
WORKDIR /repo
# See the iam Dockerfile: pnpm's default 5-minute fetch timeout cannot survive
# a slow link, and store-dir must be set explicitly for the cache mount below
# to actually be the store pnpm writes to.
RUN printf '%s\n' \
      'store-dir=/pnpm/store' \
      'fetch-timeout=1800000' \
      'fetch-retries=8' \
      'fetch-retry-mintimeout=10000' \
      'fetch-retry-maxtimeout=120000' \
      'network-concurrency=4' \
      > /repo/.npmrc

# ---------- deps ----------
FROM pnpm-base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/admin-portal/package.json apps/web/admin-portal/
# See the iam Dockerfile for why --trust-lockfile is correct here.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --trust-lockfile --store-dir=/pnpm/store

# ---------- build ----------
FROM deps AS build
COPY apps/web/admin-portal ./apps/web/admin-portal
WORKDIR /repo/apps/web/admin-portal
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_OUTPUT_STANDALONE=1
RUN pnpm exec next build

# ---------- runtime ----------
# `output: 'standalone'` (next.config.mjs) emits a server bundle with only the
# node_modules it actually needs, mirroring the monorepo path layout.
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3100
ENV HOSTNAME=0.0.0.0
RUN addgroup -S nafa && adduser -S nafa -G nafa
COPY --from=build --chown=nafa:nafa /repo/apps/web/admin-portal/.next/standalone ./
COPY --from=build --chown=nafa:nafa /repo/apps/web/admin-portal/.next/static ./apps/web/admin-portal/.next/static
USER nafa
EXPOSE 3100
CMD ["node", "apps/web/admin-portal/server.js"]
