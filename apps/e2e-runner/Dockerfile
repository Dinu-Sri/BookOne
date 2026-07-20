# BookOne E2E runner — separate container from the ERP web app
FROM mcr.microsoft.com/playwright:v1.51.0-jammy

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY playwright.config.ts ./
COPY tests ./tests
COPY src ./src
COPY public ./public

ENV E2E_RUNNER_PORT=3200
ENV E2E_BASE_URL=http://web:3100

EXPOSE 3200
CMD ["npx", "tsx", "src/server.ts"]
