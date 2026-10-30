# syntax=docker/dockerfile:1
# Two stages: the first builds the storefront bundle, the second runs the Node server with only what it needs.
# docker-compose.yml passes the build-time settings from .env as build arguments and the runtime settings as environment.
# The API key is never part of the image: it is read from the environment when the container starts.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Baked into the bundle at build time (see README.md, "Configuration").
ARG STORE_ID
ARG VITE_SHOP_MODE=live
ARG VITE_SALE_TYPE=recreational
ARG VITE_GTM_ID=
ARG VITE_STORE_TIME_ZONE=
ARG BASE_PATH=/
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DIST_DIR=/app/dist
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
COPY package.json ./
RUN rm -f server/*.test.js
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "const b=(process.env.BASE_PATH||'/').replace(/\/+$/,'');fetch('http://127.0.0.1:'+(process.env.PORT||3000)+b+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server/index.js"]
