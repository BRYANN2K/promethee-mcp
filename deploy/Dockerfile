FROM node:22.14.0-bookworm-slim AS web-build

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_MCP_BASE_URL
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY}
ENV VITE_MCP_BASE_URL=${VITE_MCP_BASE_URL}

WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --ignore-scripts
COPY web ./
RUN npm run build

FROM caddy:2.10.2-alpine

COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=web-build /app/web/dist /srv
