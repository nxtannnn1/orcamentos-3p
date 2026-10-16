FROM node:24.16.0-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY scripts/patch-braces.cjs ./scripts/patch-braces.cjs
RUN npm ci --ignore-scripts && node scripts/patch-braces.cjs
COPY . .
RUN npm run build

FROM node:24.16.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --chown=node:node scripts/container-healthcheck.mjs ./container-healthcheck.mjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=45s --retries=3 CMD ["node", "container-healthcheck.mjs"]
CMD ["node", "server.js"]
