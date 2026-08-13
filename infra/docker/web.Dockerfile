# Multi-stage build for apps/web (Next.js)
FROM node:22-alpine AS base
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
COPY packages ./packages

FROM base AS deps
RUN npm ci --workspace=apps/web --include-workspace-root

FROM deps AS build
COPY apps/web ./apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w apps/web

FROM node:22-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=build /repo/apps/web/.next ./apps/web/.next
COPY --from=build /repo/apps/web/public ./apps/web/public
COPY apps/web/package.json ./apps/web/package.json
COPY apps/web/next.config.mjs ./apps/web/next.config.mjs

EXPOSE 3000
USER node
CMD ["npm", "run", "start", "-w", "apps/web"]
