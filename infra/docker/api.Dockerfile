# Multi-stage build for apps/api (NestJS)
FROM node:22-alpine AS base
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY packages ./packages

FROM base AS deps
RUN npm ci --workspace=apps/api --include-workspace-root

FROM deps AS build
COPY apps/api ./apps/api
RUN npm run prisma:generate -w apps/api
RUN npm run build -w apps/api

FROM node:22-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma
COPY --from=build /repo/apps/api/node_modules/.prisma ./apps/api/node_modules/.prisma
COPY apps/api/package.json ./apps/api/package.json

EXPOSE 4000
USER node
CMD ["node", "apps/api/dist/main.js"]
