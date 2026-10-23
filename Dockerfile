# Chat service image. Build:  docker build -t chat-service .
# Run:  docker run -p 3101:3101 -e ANTHROPIC_API_KEY=... chat-service
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Playwright browsers are not needed to run the service
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3101
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY ai ./ai
COPY agent ./agent
COPY auth ./auth
COPY chat-service ./chat-service
COPY mock-chat-api ./mock-chat-api
COPY observability ./observability
COPY webhooks ./webhooks
COPY utils ./utils
# Run as a non-root user
USER node
EXPOSE 3101
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npx", "tsx", "chat-service/server.ts"]
