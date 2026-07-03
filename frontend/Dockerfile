FROM node:24-alpine

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/package.json

RUN pnpm install --frozen-lockfile

COPY frontend frontend

CMD ["pnpm", "--dir", "frontend", "dev", "--host", "0.0.0.0"]
