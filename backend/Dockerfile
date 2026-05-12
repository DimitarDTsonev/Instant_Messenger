FROM node:22-bookworm-slim AS build

WORKDIR /app/backend

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./
RUN npm install

COPY backend/tsconfig.json backend/tsconfig.test.json backend/jest.config.ts ./
COPY backend/server.ts ./
COPY backend/src ./src

RUN npm run build

FROM build AS prod-deps

RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

WORKDIR /app/backend

COPY --from=prod-deps /app/backend/package*.json ./
COPY --from=prod-deps /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist

RUN mkdir -p /app/data /app/uploads

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["node", "dist/server.js"]