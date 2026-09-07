FROM node:24-alpine AS build
WORKDIR /app

ARG VITE_API_BASE_URL=https://api.cmcrestaurant.app/api
# `/hub/orders` (SỐ ÍT) — đích STOMP của backend Java. Bản .NET dùng `/hubs/orders` của SignalR;
# để nguyên đường dẫn cũ thì client nối vào một đường không tồn tại và realtime im lặng chết.
ARG VITE_ORDER_HUB_URL=https://api.cmcrestaurant.app/hub/orders
ARG VITE_ORDERING_BASE_URL=https://order.cmcrestaurant.app
ARG VITE_MARKETING_BASE_URL=https://cmcrestaurant.app
ARG VITE_USE_MOCK_CHAT=false
ARG VITE_USE_MOCK_ORDER=false
ARG VITE_USE_MOCK_MENU=false

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_ORDER_HUB_URL=$VITE_ORDER_HUB_URL
ENV VITE_ORDERING_BASE_URL=$VITE_ORDERING_BASE_URL
ENV VITE_MARKETING_BASE_URL=$VITE_MARKETING_BASE_URL
ENV VITE_USE_MOCK_CHAT=$VITE_USE_MOCK_CHAT
ENV VITE_USE_MOCK_ORDER=$VITE_USE_MOCK_ORDER
ENV VITE_USE_MOCK_MENU=$VITE_USE_MOCK_MENU

COPY frontend/package*.json ./
COPY frontend/apps/admin-web/package.json ./apps/admin-web/package.json
COPY frontend/apps/customer-web/package.json ./apps/customer-web/package.json
COPY frontend/apps/ordering-web/package.json ./apps/ordering-web/package.json
COPY frontend/packages/brand-ui/package.json ./packages/brand-ui/package.json
COPY frontend/packages/api-client/package.json ./packages/api-client/package.json
COPY frontend/packages/auth/package.json ./packages/auth/package.json
COPY frontend/packages/i18n/package.json ./packages/i18n/package.json
COPY frontend/packages/realtime-client/package.json ./packages/realtime-client/package.json
COPY frontend/packages/shared-types/package.json ./packages/shared-types/package.json
COPY frontend/packages/shared-ui/package.json ./packages/shared-ui/package.json
RUN npm ci

COPY frontend/ ./
RUN npm run build:all

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=nginx:nginx /app/apps/customer-web/dist /usr/share/nginx/html/customer
COPY --from=build --chown=nginx:nginx /app/apps/ordering-web/dist /usr/share/nginx/html/ordering
COPY --from=build --chown=nginx:nginx /app/apps/admin-web/dist /usr/share/nginx/html/admin

EXPOSE 8080
USER nginx
