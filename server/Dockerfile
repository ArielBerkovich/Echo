FROM node:24-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY src ./src
COPY tsconfig.json ./
RUN npm run build

FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

# Keep UID 1000 as the local default while allowing OpenShift to assign any
# non-root UID. Runtime files are readable through group 0; HOME is writable.
RUN chgrp -R 0 /app \
 && chmod -R g=u /app

EXPOSE 4000

USER node
ENV HOME=/tmp
CMD ["node", "dist/index.js"]
