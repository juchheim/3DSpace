FROM node:20-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/room-engine/package.json packages/room-engine/package.json
RUN npm ci

FROM node:20-slim AS builder
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build -w @3dspace/contracts \
  && npm run build -w @3dspace/room-engine \
  && npm run build -w @3dspace/api

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/room-engine/package.json packages/room-engine/package.json
RUN npm ci --omit=dev --workspaces --include-workspace-root=false

COPY --from=builder /app/apps/api/dist apps/api/dist
COPY --from=builder /app/packages/contracts/dist packages/contracts/dist
COPY --from=builder /app/packages/room-engine/dist packages/room-engine/dist

EXPOSE 8080
CMD ["node", "apps/api/dist/server.js"]
