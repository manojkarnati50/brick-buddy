# Build the React app, then serve it with nginx (HTTP 8080 + HTTPS 8443 with a self-signed cert,
# because iPad Safari only allows the microphone on HTTPS pages).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
RUN apk add --no-cache openssl
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/certs.sh /docker-entrypoint.d/05-certs.sh
RUN chmod +x /docker-entrypoint.d/05-certs.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080 8443
