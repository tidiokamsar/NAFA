# NAFA — services/foundation/iam
#
# Build from the REPO ROOT (the build needs the workspace manifests, the shared
# Prisma schema and the @nafa/platform package, all outside the service dir):
#
#   docker build -f infrastructure/docker/iam/Dockerfile -t nafa/iam:dev .

# ---------- base toolchain ----------
# Shared by every stage that installs dependencies, so the network settings and
# the store location are declared once.
FROM node:22-alpine AS pnpm-base
RUN corepack enable
WORKDIR /repo
# Network settings tuned for a slow, high-latency link. Written to .npmrc
# rather than passed as env vars because pnpm reads this file unambiguously,
# and the repo has no .npmrc of its own to clobber.
#
# The 5-minute default fetch timeout is the one that kept killing this build at
# ~99% of the download.
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
COPY packages/shared/package.json packages/shared/
COPY packages/platform/package.json packages/platform/
COPY services/foundation/iam/package.json services/foundation/iam/
# --trust-lockfile skips re-running the supply-chain check against every
# lockfile entry. The lockfile is committed and already verified outside the
# image, which is exactly the case pnpm documents this flag for; without it the
# check alone costs ~12 minutes of registry round-trips per stage.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --trust-lockfile --store-dir=/pnpm/store

# ---------- build ----------
FROM deps AS build
COPY tsconfig.base.json ./
COPY database ./database
COPY packages/shared ./packages/shared
COPY packages/platform ./packages/platform
COPY services/foundation/iam ./services/foundation/iam
# Dependency order matters: platform imports shared, iam imports both, and each
# consumes the others' compiled dist/.
RUN pnpm --filter @nafa/shared run build \
 && pnpm --filter @nafa/platform run build
WORKDIR /repo/services/foundation/iam
# `prisma generate` resolves DATABASE_URL through prisma.config.ts but never
# opens a connection, so a syntactically valid placeholder is enough here.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm exec prisma generate && pnpm exec nest build

# ---------- migrator ----------
# One-shot image carrying the Prisma CLI and the schema. Compose runs this to
# completion before the service starts, so the database is ready on first boot.
FROM build AS migrator
WORKDIR /repo/services/foundation/iam
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# ---------- production deps ----------
FROM pnpm-base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/platform/package.json packages/platform/
COPY services/foundation/iam/package.json services/foundation/iam/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --trust-lockfile --store-dir=/pnpm/store --prod

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S nafa && adduser -S nafa -G nafa
COPY --from=prod-deps --chown=nafa:nafa /repo/node_modules ./node_modules
COPY --from=prod-deps --chown=nafa:nafa /repo/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=prod-deps --chown=nafa:nafa /repo/packages/platform/node_modules ./packages/platform/node_modules
COPY --from=prod-deps --chown=nafa:nafa /repo/services/foundation/iam/node_modules ./services/foundation/iam/node_modules
COPY --from=build --chown=nafa:nafa /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=nafa:nafa /repo/packages/shared/package.json ./packages/shared/
COPY --from=build --chown=nafa:nafa /repo/packages/platform/dist ./packages/platform/dist
COPY --from=build --chown=nafa:nafa /repo/packages/platform/package.json ./packages/platform/
COPY --from=build --chown=nafa:nafa /repo/services/foundation/iam/dist ./dist
COPY --from=build --chown=nafa:nafa /repo/services/foundation/iam/package.json ./
USER nafa
EXPOSE 3000 9464
CMD ["node", "dist/main.js"]
