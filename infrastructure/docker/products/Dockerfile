# NAFA — services/masters/products
#
# Build from the REPO ROOT (the build needs the workspace manifests, the shared
# Prisma schema and the @nafa/* packages, all outside the service dir):
#
#   docker build -f infrastructure/docker/products/Dockerfile -t nafa/products:dev .
#
# Workspace closure for this service: shared, products, platform.

# ---------- deps ----------
FROM node:22-alpine AS deps
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/products/package.json packages/products/
COPY packages/platform/package.json packages/platform/
COPY services/masters/products/package.json services/masters/products/
# `minimumReleaseAge` defaults to 1440 minutes since pnpm 11, so every install
# re-checks the publish date of all 1289 lockfile entries against the registry:
# six and a half minutes of metadata requests before a single package is
# downloaded, and on a slow link that alone times the build out.
#
# Turning it off here is a trade, not a shortcut. The setting guards version
# *resolution*, and `--frozen-lockfile` resolves nothing: the versions are
# already pinned and reviewed in the committed lockfile. The protection belongs
# where that lockfile changes, not on every rebuild of one that has not moved.
RUN pnpm install --frozen-lockfile --config.minimumReleaseAge=0

# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /repo/packages/products/node_modules ./packages/products/node_modules
COPY --from=deps /repo/packages/platform/node_modules ./packages/platform/node_modules
COPY --from=deps /repo/services/masters/products/node_modules ./services/masters/products/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY database ./database
COPY packages/shared ./packages/shared
COPY packages/products ./packages/products
COPY packages/platform ./packages/platform
COPY services/masters/products ./services/masters/products
# Dependency order, not alphabetical: platform and products both consume
# shared's dist, so shared compiles first.
RUN pnpm --filter @nafa/shared run build \
  && pnpm --filter @nafa/products run build \
  && pnpm --filter @nafa/platform run build
WORKDIR /repo/services/masters/products
# `prisma generate` resolves DATABASE_URL through prisma.config.ts but never
# opens a connection, so a syntactically valid placeholder is enough here.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm exec prisma generate && pnpm exec nest build

# ---------- production deps ----------
# Derived from `deps` rather than installed a second time. BuildKit runs
# independent stages in parallel, so two full installs used to race, and each
# paid pnpm's supply-chain check over the whole lockfile: about 1300 entries
# and seven minutes apiece. The contention alone was enough to time one of them
# out. Pruning reuses the tree `deps` already resolved, so the registry is
# contacted once per image instead of twice.
FROM deps AS prod-deps
WORKDIR /repo
RUN pnpm prune --prod

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S nafa && adduser -S nafa -G nafa
COPY --from=prod-deps --chown=nafa:nafa /repo/node_modules ./node_modules
COPY --from=prod-deps --chown=nafa:nafa /repo/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=prod-deps --chown=nafa:nafa /repo/packages/products/node_modules ./packages/products/node_modules
COPY --from=prod-deps --chown=nafa:nafa /repo/packages/platform/node_modules ./packages/platform/node_modules
COPY --from=prod-deps --chown=nafa:nafa /repo/services/masters/products/node_modules ./services/masters/products/node_modules
COPY --from=build --chown=nafa:nafa /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=nafa:nafa /repo/packages/shared/package.json ./packages/shared/
COPY --from=build --chown=nafa:nafa /repo/packages/products/dist ./packages/products/dist
COPY --from=build --chown=nafa:nafa /repo/packages/products/package.json ./packages/products/
COPY --from=build --chown=nafa:nafa /repo/packages/platform/dist ./packages/platform/dist
COPY --from=build --chown=nafa:nafa /repo/packages/platform/package.json ./packages/platform/
COPY --from=build --chown=nafa:nafa /repo/services/masters/products/dist ./dist
COPY --from=build --chown=nafa:nafa /repo/services/masters/products/package.json ./
USER nafa
EXPOSE 3300 9464
CMD ["node", "dist/main.js"]
