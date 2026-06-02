# ── Build stage ───────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# VITE_STRAPI_URL is injected at build time via docker-compose build args
ARG VITE_STRAPI_URL=/api-backend
ENV VITE_STRAPI_URL=$VITE_STRAPI_URL

RUN npm run build

# ── Production stage: serve with nginx ───────────────────
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

# React Router: send all routes to index.html
RUN echo 'server { \
  listen 3000; \
  root /usr/share/nginx/html; \
  index index.html; \
  location / { try_files $uri $uri/ /index.html; } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
