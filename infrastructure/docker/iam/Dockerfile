# NAFA — services/foundation/iam
#
# Build from the REPO ROOT (the build needs the workspace manifests, the shared
# Prisma schema and the @nafa/platform package, all outside the service dir):
#
#   docker build -f infrastructure/docker/iam/Dockerfile -t nafa/iam:dev .

# ---------- deps ----------
FROM node:22-alpine AS deps
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/platform/package.json packages/platform/
COPY packages/shared/package.json packages/shared/
COPY packages/foundation/package.json packages/foundation/
COPY services/foundation/iam/package.json services/foundation/iam/
RUN pnpm install --frozen-lockfile

# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages/platform/node_modules ./packages/platform/node_modules
COPY --from=deps /repo/services/foundation/iam/node_modules ./services/foundation/iam/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY database ./database
COPY packages/platform ./packages/platform
COPY packages/shared ./packages/shared
COPY packages/foundation ./packages/foundation
COPY services/foundation/iam ./services/foundation/iam
# Compile workspace dependencies before the IAM service.
RUN pnpm --filter @nafa/shared run build && pnpm --filter @nafa/foundation run build && pnpm --filter @nafa/platform run build
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
FROM node:22-alpine AS prod-deps
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/platform/package.json packages/platform/
COPY services/foundation/iam/package.json services/foundation/iam/
COPY packages/shared/package.json packages/shared/
COPY packages/foundation/package.json packages/foundation/
RUN pnpm install --frozen-lockfile --prod

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S nafa && adduser -S nafa -G nafa
COPY --from=prod-deps --chown=nafa:nafa /repo/node_modules ./node_modules
COPY --from=prod-deps --chown=nafa:nafa /repo/packages/platform/node_modules ./packages/platform/node_modules
COPY --from=prod-deps --chown=nafa:nafa /repo/services/foundation/iam/node_modules ./services/foundation/iam/node_modules
COPY --from=build --chown=nafa:nafa /repo/packages/platform/dist ./packages/platform/dist
COPY --from=build --chown=nafa:nafa /repo/packages/platform/package.json ./packages/platform/
COPY --from=build --chown=nafa:nafa /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=nafa:nafa /repo/packages/shared/package.json ./packages/shared/
COPY --from=build --chown=nafa:nafa /repo/packages/foundation/dist ./packages/foundation/dist
COPY --from=build --chown=nafa:nafa /repo/packages/foundation/package.json ./packages/foundation/
COPY --from=build --chown=nafa:nafa /repo/services/foundation/iam/dist ./dist
COPY --from=build --chown=nafa:nafa /repo/services/foundation/iam/package.json ./
USER nafa
EXPOSE 3000 9464
CMD ["node", "dist/main.js"]
