FROM node:22-bookworm-slim AS build

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/index.html ./
COPY frontend/tsconfig*.json ./
COPY frontend/vite.config.ts ./
COPY frontend/src ./src
COPY frontend/public ./public

ARG VITE_API_URL=http://localhost:4000/api
ARG VITE_SOCKET_URL=http://localhost:4000
ARG VITE_BASE_PATH=/

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
ENV VITE_BASE_PATH=$VITE_BASE_PATH

RUN npm run typecheck && npm run build

FROM nginx:1.27-alpine

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80
