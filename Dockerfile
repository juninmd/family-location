# syntax=docker/dockerfile:1
FROM node:22-alpine AS web
WORKDIR /app
COPY app/package.json app/package-lock.json app/.npmrc ./
RUN npm ci --no-audit --no-fund
COPY app/index.html app/tsconfig.json app/vite.config.ts ./
COPY app/public ./public
COPY app/src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /srv
ENV NODE_ENV=production PORT=3000 DB_PATH=/data/family.sqlite PUBLIC_DIR=/srv/public
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && mkdir -p /data && chown node:node /data
COPY server/src ./src
COPY --from=web /app/dist ./public
USER node
EXPOSE 3000
VOLUME /data
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.js"]
