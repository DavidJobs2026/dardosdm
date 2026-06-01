FROM node:20-alpine

# Install pnpm directly (no corepack)
RUN npm install -g pnpm@11

WORKDIR /app

# Copy workspace config files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages/ ./packages/
COPY server/ ./server/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm --filter server exec prisma generate

# Build server
RUN pnpm --filter server build

EXPOSE 4000

CMD ["node", "server/dist/index.js"]
