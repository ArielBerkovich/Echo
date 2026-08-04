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

# Prepare writable paths for both the image's default UID 101 and OpenShift's
# arbitrary non-root UID. OpenShift-assigned users are members of group 0.
RUN mkdir -p /var/cache/nginx/client_temp \
    /var/cache/nginx/proxy_temp \
    /var/cache/nginx/fastcgi_temp \
    /var/cache/nginx/uwsgi_temp \
    /var/cache/nginx/scgi_temp \
    /var/run/nginx \
    /etc/nginx/conf.d \
 && chown -R 101:0 /var/cache/nginx /var/run/nginx /var/log/nginx \
    /etc/nginx/conf.d /etc/nginx/templates /usr/share/nginx/html \
 && sed -i 's#^pid[[:space:]].*;#pid /tmp/nginx.pid;#' /etc/nginx/nginx.conf \
 && chmod -R g=u /var/cache/nginx /var/run/nginx /var/log/nginx \
    /etc/nginx/conf.d /etc/nginx/templates /usr/share/nginx/html

# The LAN URL is used by mobile browsers, which require a secure origin for
# microphone and camera access. This development certificate is for the local
# Echo host only; production should use a real certificate.
RUN apk add --no-cache openssl \
 && mkdir -p /etc/nginx/certs \
 && openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
      -keyout /etc/nginx/certs/echo.key \
      -out /etc/nginx/certs/echo.crt \
      -subj "/CN=192.168.1.110" \
      -addext "subjectAltName=IP:192.168.1.110,IP:127.0.0.1,DNS:localhost" \
 && chown -R 101:0 /etc/nginx/certs \
 && chmod 640 /etc/nginx/certs/echo.key \
 && chmod 644 /etc/nginx/certs/echo.crt

USER 101
EXPOSE 8080
ENV SERVER_HOST=server \
    HOME=/tmp
CMD ["nginx", "-g", "daemon off;"]
