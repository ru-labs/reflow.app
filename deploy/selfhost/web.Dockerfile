FROM node:24-alpine AS build
WORKDIR /app

# patches/ must be present for the postinstall (patch-package) step
COPY package.json package-lock.json ./
COPY patches ./patches
RUN npm ci

COPY . .

ARG BUILD_MODE=production
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_SUPABASE_SCHEMA
ARG VITE_APP_VERSION
ARG VITE_APP_COMMIT
RUN npx tsc -b && npx vite build --mode ${BUILD_MODE}

FROM caddy:2-alpine
# Caddyfile is baked in (not bind-mounted): Dokploy re-clones the repo on every deploy
COPY deploy/selfhost/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv/www
