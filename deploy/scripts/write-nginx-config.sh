#!/usr/bin/env bash
set -euo pipefail

: "${DEPLOY_ENV:?DEPLOY_ENV is required}"
: "${FRONTEND_SERVER_NAMES:?FRONTEND_SERVER_NAMES is required}"
: "${API_SERVER_NAME:?API_SERVER_NAME is required}"
: "${FRONTEND_PORT:?FRONTEND_PORT is required}"
: "${BACKEND_PORT:?BACKEND_PORT is required}"

# TLS bật bằng cách trỏ TLS_CERT_DIR vào thư mục chứa fullchain.pem/privkey.pem.
#
# Vì sao là tuỳ chọn chứ không mặc định bật: nginx TỪ CHỐI khởi động nếu khối 443 trỏ vào chứng
# chỉ chưa tồn tại, mà chứng chỉ Let's Encrypt lại phải xin QUA cổng 80 của chính nginx này. Bật
# cứng TLS ngay từ đầu là tự khoá mình ra ngoài. Trình tự đúng: triển khai HTTP trước, xin chứng
# chỉ, rồi đặt TLS_CERT_DIR và chạy lại.
TLS_CERT_DIR="${TLS_CERT_DIR:-}"

config_path="/etc/nginx/sites-available/cmc-${DEPLOY_ENV}.conf"

# Phần thân proxy dùng chung cho cả HTTP lẫn HTTPS — viết một lần để hai nhánh không trôi khỏi nhau.
proxy_common() {
  cat <<EOF
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
EOF
}

tls_block() {
  cat <<EOF
    ssl_certificate     ${TLS_CERT_DIR}/fullchain.pem;
    ssl_certificate_key ${TLS_CERT_DIR}/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
EOF
}

{
  if [[ -n "$TLS_CERT_DIR" ]]; then
    # Cổng 80 chỉ còn hai việc: phục vụ thử thách ACME để gia hạn chứng chỉ, và đẩy sang HTTPS.
    #
    # Đẩy sang HTTPS là bắt buộc chứ không phải cho đẹp: webhook SePay mang khoá API trong header
    # Authorization, và trên HTTP thuần thì khoá đó đi qua mạng ở dạng chữ thường.
    cat <<EOF
server {
    listen 80;
    server_name ${FRONTEND_SERVER_NAMES} ${API_SERVER_NAME};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    http2 on;
    server_name ${FRONTEND_SERVER_NAMES};

$(tls_block)

    location / {
        proxy_pass http://127.0.0.1:${FRONTEND_PORT};
$(proxy_common)
    }
}

server {
    listen 443 ssl;
    http2 on;
    server_name ${API_SERVER_NAME};

$(tls_block)

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
$(proxy_common)
    }

    # `/hub/` SỐ ÍT — đường thật của endpoint STOMP, xem WebSocketConfig.addEndpoint.
    # Viết `/hubs/` (đường của bản .NET) thì WebSocket rơi vào `location /`, nơi KHÔNG có header
    # nâng cấp. Nginx cắt mất Upgrade, Tomcat trả 400 "Can Upgrade only to WebSocket", và client
    # thử lại vô hạn — giao diện hiện "Đang kết nối lại…" mãi mà không lỗi nào rõ ràng.
    location /hub/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
$(proxy_common)
    }
}
EOF
  else
    # Chưa có chứng chỉ: HTTP thuần, đủ để xin chứng chỉ rồi chạy lại script này.
    cat <<EOF
server {
    listen 80;
    server_name ${FRONTEND_SERVER_NAMES};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        proxy_pass http://127.0.0.1:${FRONTEND_PORT};
$(proxy_common)
    }
}

server {
    listen 80;
    server_name ${API_SERVER_NAME};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
$(proxy_common)
    }

    # `/hub/` SỐ ÍT — đường thật của endpoint STOMP, xem WebSocketConfig.addEndpoint.
    # Viết `/hubs/` (đường của bản .NET) thì WebSocket rơi vào `location /`, nơi KHÔNG có header
    # nâng cấp. Nginx cắt mất Upgrade, Tomcat trả 400 "Can Upgrade only to WebSocket", và client
    # thử lại vô hạn — giao diện hiện "Đang kết nối lại…" mãi mà không lỗi nào rõ ràng.
    location /hub/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
$(proxy_common)
    }
}
EOF
  fi
} > "$config_path"

ln -sf "$config_path" "/etc/nginx/sites-enabled/cmc-${DEPLOY_ENV}.conf"
nginx -t
systemctl reload nginx

if [[ -z "$TLS_CERT_DIR" ]]; then
  echo "CẢNH BÁO: đang chạy HTTP thuần. Xin chứng chỉ rồi đặt TLS_CERT_DIR và chạy lại script này." >&2
  echo "  sudo certbot certonly --webroot -w /var/www/html -d ${API_SERVER_NAME}" >&2
fi
