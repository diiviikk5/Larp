# A hosted Larp coordinator: shared state for a space and the phone web app.
# Agents never run here; they run on each person's own computer and connect out to this server.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npx tsc -b && npx vite build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY server ./server
COPY --from=build /app/dist ./dist
# Local files are only a fallback: set YUGABYTE_URL so state survives restarts and redeploys.
ENV LARP_DATA_DIR=/data
EXPOSE 8080
ENV PORT=8080
CMD ["node", "server/cli.mjs", "serve"]
