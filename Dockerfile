# syntax=docker/dockerfile:1

FROM node:lts-bullseye-slim AS build
WORKDIR /bot

COPY . .
RUN npm ci
RUN npm run build

FROM node:lts-bullseye-slim AS final
ENV NODE_ENV=production
WORKDIR /bot

COPY package*.json ./
COPY --from=build /bot/dst/ .
RUN npm ci

CMD ["node", "index.js"]
