# Multi-stage Docker build for AuthMesh Security Gateway
FROM node:24-alpine AS base
WORKDIR /app

# Stage 1: Build client and server
FROM base AS builder
COPY package.json package-lock.json* ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci

COPY shared/ ./shared/
COPY server/ ./server/
COPY client/ ./client/

RUN npm run build

# Stage 2: Production runtime
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=4000

COPY --chown=node:node package.json ./
COPY --chown=node:node server/package.json ./server/
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
# server/dist already contains the compiled shared/ modules (tsc's rootDir
# spans both server/src and ../shared, see server/tsconfig.json), so nothing
# else needs to be copied from the shared/ source directory.
COPY --from=builder --chown=node:node /app/server/dist ./server/dist
COPY --from=builder --chown=node:node /app/client/dist ./client/dist

RUN mkdir -p /app/server/data && chown -R node:node /app/server/data

EXPOSE 4000
WORKDIR /app/server
USER node

CMD ["node", "dist/server/src/index.js"]
