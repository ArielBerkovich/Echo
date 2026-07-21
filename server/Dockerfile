FROM node:24-alpine AS build

WORKDIR /app

COPY server/package*.json ./
RUN npm ci

COPY server/src ./src
COPY server/tsconfig.json ./
RUN npm run build

FROM node:24-alpine

WORKDIR /app

COPY server/package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY desktop-updates ./desktop-updates

# Keep UID 1000 as the local default while allowing OpenShift to assign any
# non-root UID. Runtime files are readable through group 0; HOME is writable.
RUN chgrp -R 0 /app \
 && chmod -R g=u /app

EXPOSE 4000

USER node
ENV HOME=/tmp \
    DESKTOP_UPDATE_DIR=/app/desktop-updates
CMD ["node", "dist/index.js"]
