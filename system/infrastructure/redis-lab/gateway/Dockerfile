FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

COPY --chown=node:node server.mjs handler.mjs commands.mjs healthcheck.mjs ./

USER node

EXPOSE 8080

CMD ["node", "server.mjs"]
