# syntax=docker/dockerfile:1

# ---- Build: install all deps and compile client + server ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Runtime: production deps + compiled output only ----
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
# Migrations are applied on startup from server/db/migrations
COPY --from=build /app/server/db/migrations ./server/db/migrations

USER node
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3002/api/health || exit 1
CMD ["node", "dist-server/index.js"]
