FROM node:22-alpine
WORKDIR /app

ENV CI=true

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .
RUN pnpm run build

EXPOSE 4000
CMD ["node", "dist/main.js"]