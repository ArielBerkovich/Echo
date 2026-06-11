# --- Build stage: compile the React app ---
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json ./
COPY package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Serve stage: static files behind nginx (also proxies API + websockets) ---
FROM nginx:alpine
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
ENV SERVER_HOST=server
CMD ["nginx", "-g", "daemon off;"]
