# NAFA — apps/web/admin-portal
#
# Build from the REPO ROOT (needs the workspace manifests):
#
#   docker build -f infrastructure/docker/admin-portal/Dockerfile -t nafa/admin-portal:dev .

# ---------- deps ----------
FROM node:22-alpine AS deps
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/admin-portal/package.json apps/web/admin-portal/
RUN pnpm install --frozen-lockfile

# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/admin-portal/node_modules ./apps/web/admin-portal/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
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
