# -------- build frontend --------
FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# -------- install backend deps --------
FROM node:22-alpine AS backend-deps
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev

# -------- runtime (single image) --------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# backend
COPY --from=backend-deps /app/node_modules ./node_modules
COPY backend/server.js ./server.js

# frontend static build
COPY --from=frontend-build /app/build ./public

EXPOSE 8080
CMD ["node","server.js"]
