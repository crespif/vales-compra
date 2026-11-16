# Imagen única: API (NestJS) + web (React) servida por la misma API.
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM node:22-alpine AS api
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci
COPY backend/ .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production FRONTEND_DIR=/app/web
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY --from=api /app/dist ./dist
COPY --from=web /web/dist ./web
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/salud || exit 1
# Al arrancar: migraciones + datos iniciales (idempotente) y después la app.
CMD ["sh", "-c", "node dist/database/seed.js && node dist/main.js"]
