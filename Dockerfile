# ---------- Stage 1: build the Vite/TanStack Start SPA ----------
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Bake a placeholder instead of a real URL so the API base can be set at
# container start via the API_BASE_URL env var (see docker-entrypoint.sh)
ENV VITE_API_BASE_URL=__API_BASE_URL_PLACEHOLDER__
RUN npm run build

# ---------- Stage 2: serve static files with nginx ----------
FROM nginx:1.27-alpine

COPY --from=build /app/dist/client /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.d/40-inject-api-url.sh
RUN chmod +x /docker-entrypoint.d/40-inject-api-url.sh

# Set at runtime, e.g. -e API_BASE_URL=https://api.yourdomain.com/api
ENV API_BASE_URL=http://localhost:3201/api

EXPOSE 80
