#!/usr/bin/env bash
set -euo pipefail

# LLM_RATE_LIMIT_FALLBACK_MODEL is deliberately absent from required_vars: a
# single-model deployment has no fallback, and the loop below rejects empty
# values, so listing it would force naming a model that is never called.
#
# Keep this note outside the array.  DeploymentConfigTest (backend-java) đọc khối
# required_vars và tách theo khoảng trắng để kiểm .github/workflows/cd.yml có cấp đủ mọi tên hay
# không, nên một ghi chú nằm TRONG ngoặc sẽ thành danh sách tên biến giả — bash bỏ qua, phép kiểm
# đó thì không.
#
# Ghi chú cũ trỏ tới frontend/src/utils/deploymentWorkflowEnv.test.ts. Tệp đó không còn tồn tại
# trong repo này; luật được dựng lại ở DeploymentConfigTest.theWorkflowSuppliesEveryRequiredVariable.
required_vars=(
  DEPLOY_ENV
  SSH_HOST
  SSH_USER
  SSH_KEY
  COMPOSE_PROJECT_NAME
  FRONTEND_PORT
  BACKEND_PORT
  POSTGRES_PORT
  POSTGRES_DB
  POSTGRES_USER
  POSTGRES_PASSWORD
  FRONTEND_SERVER_NAMES
  API_SERVER_NAME
  PUBLIC_API_BASE_URL
  JWT_SIGNING_KEY
  CORS_ALLOWED_ORIGINS
  PAYMENTS_VIETQR_BANKID
  PAYMENTS_VIETQR_ACCOUNTNUMBER
  PAYMENTS_VIETQR_ACCOUNTNAME
  PAYMENTS_SEPAY_APIKEY
  FIREBASE_API_KEY
  FIREBASE_PROJECT_ID
  GOOGLE_CLIENT_ID
  AI_SERVICE_URL
  AI_INTERNAL_TOKEN
  LLM_API_KEY
  LLM_MODEL
)
# Ba tên vừa RA khỏi danh sách: LLM_PROVIDER, LLM_RATE_LIMIT_FALLBACK_ENABLED, AI_PIPELINE_PROFILE.
#
# Không mô-đun nào đọc chúng nữa — `ai/app` chỉ đọc LLM_BASE_URL, LLM_API_KEY, LLM_MODEL,
# LLM_TIMEOUT_SECONDS, AI_INTERNAL_TOKEN, AI_ENABLE_GENERATION, AI_EMBEDDING_CACHE. Đòi một biến
# không ai đọc là dựng một cái bẫy: deploy DỪNG vì thiếu thứ không có tác dụng gì, và người sửa
# phải đi tìm hiểu một biến đã chết để biết nên đặt giá trị nào.
#
# `AI_PIPELINE_PROFILE` còn tệ hơn hai cái kia: `ChatAiProvider.ReadPipelineProfile()` NÉM LỖI với
# bất kỳ giá trị không thuộc ba tên profile cũ, rồi gửi trường đó tới dịch vụ mới — nơi bỏ qua nó.
# Tức đặt cho nó một tên của hệ thống mới là làm sập mọi lượt chat.

for var_name in "${required_vars[@]}"; do
  if [ -z "${!var_name:-}" ]; then
    echo "Missing required variable: ${var_name}" >&2
    exit 1
  fi
done

root_dir="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

key_file="${work_dir}/deploy_key"
known_hosts_file="${work_dir}/known_hosts"
tarball="${work_dir}/release.tgz"

printf '%s\n' "$SSH_KEY" > "$key_file"
chmod 600 "$key_file"
ssh-keyscan -H "$SSH_HOST" > "$known_hosts_file" 2>/dev/null

tar -C "$root_dir" \
  --exclude='.git' \
  --exclude='.playwright-cli' \
  --exclude='tmp' \
  --exclude='**/node_modules' \
  --exclude='**/dist' \
  --exclude='**/bin' \
  --exclude='**/obj' \
  --exclude='*.log' \
  -czf "$tarball" .

remote_root="/opt/cmc-restaurant/${DEPLOY_ENV}"

# Giữ kết nối sống trong lúc build im lặng.
#
# Deploy staging ngày 08/08 hỏng với `client_loop: send disconnect: Broken pipe`
# ngay giữa bước `RUN python -m rag.precompute` — bước tính trước vector nhúng,
# chạy vài phút mà không in gì. Không có gì đi qua kết nối trong khoảng đó, nên
# nó bị coi là chết và bị cắt; build trên VPS vẫn chạy tiếp nhưng workflow đã
# thoát với mã 255.
#
# Đây là hỏng do IM LẶNG, không do lỗi. Nó sẽ quay lại mỗi khi có một bước build
# đủ lâu — và bước đó thì càng ngày càng lâu khi kho tri thức lớn lên.
#
# 30 giây × 20 lần = chịu được 10 phút im lặng trước khi thật sự bỏ cuộc.
keepalive=(-o ServerAliveInterval=30 -o ServerAliveCountMax=20)

ssh_base=(ssh -i "$key_file" -o UserKnownHostsFile="$known_hosts_file" -o StrictHostKeyChecking=yes "${keepalive[@]}" "${SSH_USER}@${SSH_HOST}")
scp_base=(scp -i "$key_file" -o UserKnownHostsFile="$known_hosts_file" -o StrictHostKeyChecking=yes "${keepalive[@]}")

"${ssh_base[@]}" "mkdir -p '${remote_root}' '${remote_root}/reports' '${remote_root}/backups'"
"${scp_base[@]}" "$tarball" "${SSH_USER}@${SSH_HOST}:${remote_root}/release.tgz"

env_quote() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//\$/\\$}"
  value="${value//\`/\\\`}"
  printf '"%s"' "$value"
}

env_file="${work_dir}/deploy.env"
cat > "$env_file" <<EOF
DEPLOY_ENV=$(env_quote "$DEPLOY_ENV")
COMPOSE_PROJECT_NAME=$(env_quote "$COMPOSE_PROJECT_NAME")
FRONTEND_PORT=$(env_quote "$FRONTEND_PORT")
BACKEND_PORT=$(env_quote "$BACKEND_PORT")
POSTGRES_PORT=$(env_quote "$POSTGRES_PORT")
POSTGRES_DB=$(env_quote "$POSTGRES_DB")
POSTGRES_USER=$(env_quote "$POSTGRES_USER")
POSTGRES_PASSWORD=$(env_quote "$POSTGRES_PASSWORD")
DB_MIN_POOL_SIZE=$(env_quote "${DB_MIN_POOL_SIZE:-2}")
DB_MAX_POOL_SIZE=$(env_quote "${DB_MAX_POOL_SIZE:-50}")
FRONTEND_SERVER_NAMES=$(env_quote "$FRONTEND_SERVER_NAMES")
  API_SERVER_NAME=$(env_quote "$API_SERVER_NAME")
  PUBLIC_API_BASE_URL=$(env_quote "$PUBLIC_API_BASE_URL")
  PUBLIC_ORDER_HUB_URL=$(env_quote "${PUBLIC_ORDER_HUB_URL:-${PUBLIC_API_BASE_URL%/api}/hubs/orders}")
  CORS_ALLOWED_ORIGINS=$(env_quote "$CORS_ALLOWED_ORIGINS")
  JWT_SIGNING_KEY=$(env_quote "$JWT_SIGNING_KEY")
  ADMIN_BOOTSTRAP_EMAIL=$(env_quote "${ADMIN_BOOTSTRAP_EMAIL:-}")
  ADMIN_BOOTSTRAP_PASSWORD=$(env_quote "${ADMIN_BOOTSTRAP_PASSWORD:-}")
  ADMIN_BOOTSTRAP_FULL_NAME=$(env_quote "${ADMIN_BOOTSTRAP_FULL_NAME:-}")
  PAYMENTS_VIETQR_BANKID=$(env_quote "$PAYMENTS_VIETQR_BANKID")
  PAYMENTS_VIETQR_ACCOUNTNUMBER=$(env_quote "$PAYMENTS_VIETQR_ACCOUNTNUMBER")
  PAYMENTS_VIETQR_ACCOUNTNAME=$(env_quote "$PAYMENTS_VIETQR_ACCOUNTNAME")
  PAYMENTS_VIETQR_TEMPLATE=$(env_quote "${PAYMENTS_VIETQR_TEMPLATE:-compact2}")
  PAYMENTS_SEPAY_APIKEY=$(env_quote "$PAYMENTS_SEPAY_APIKEY")
  FIREBASE_API_KEY=$(env_quote "$FIREBASE_API_KEY")
  FIREBASE_PROJECT_ID=$(env_quote "$FIREBASE_PROJECT_ID")
  GOOGLE_CLIENT_ID=$(env_quote "$GOOGLE_CLIENT_ID")
  BACKEND_JAVA_BIND=$(env_quote "${BACKEND_JAVA_BIND:-127.0.0.1}")
  # Thư mục chứng chỉ TLS. Bỏ trống = nginx chạy HTTP thuần.
  #
  # PHẢI đi qua đây, không thể chỉ đặt tay trên máy chủ một lần: script này cũng gọi
  # `write-nginx-config.sh`, nên mỗi lượt triển khai ghi đè cấu hình nginx. Đặt TLS bằng tay rồi
  # triển khai lại là mất TLS — và mất một cách khó thấy, vì trang vẫn lên trên HTTP trong khi
  # bundle đã được dựng để gọi API qua HTTPS. Đã gặp thật.
  TLS_CERT_DIR=$(env_quote "${TLS_CERT_DIR:-}")
RUN_DB_MIGRATIONS_ON_STARTUP=$(env_quote "${RUN_DB_MIGRATIONS_ON_STARTUP:-false}")
CHAT_AI_PROVIDER=$(env_quote "${CHAT_AI_PROVIDER:-python-rag}")
AI_SERVICE_URL=$(env_quote "$AI_SERVICE_URL")
AI_SERVICE_PORT=$(env_quote "${AI_SERVICE_PORT:-8001}")
AI_INTERNAL_TOKEN=$(env_quote "$AI_INTERNAL_TOKEN")
LLM_BASE_URL=$(env_quote "${LLM_BASE_URL:-}")
# Rỗng = không dựng dịch vụ AI. Đặt "ai" để bật lại.
COMPOSE_PROFILES=$(env_quote "${COMPOSE_PROFILES:-}")
LLM_API_KEY=$(env_quote "$LLM_API_KEY")
LLM_MODEL=$(env_quote "$LLM_MODEL")
AI_TIMEOUT_SECONDS=$(env_quote "${AI_TIMEOUT_SECONDS:-60}")
LLM_TIMEOUT_SECONDS=$(env_quote "${LLM_TIMEOUT_SECONDS:-${AI_TIMEOUT_SECONDS:-30}}")
VITE_USE_MOCK_CHAT=$(env_quote "${VITE_USE_MOCK_CHAT:-false}")
VITE_USE_MOCK_ORDER=$(env_quote "${VITE_USE_MOCK_ORDER:-false}")
BOOTSTRAP_ADMIN_EMAIL=$(env_quote "${BOOTSTRAP_ADMIN_EMAIL:-}")
BOOTSTRAP_ADMIN_PASSWORD=$(env_quote "${BOOTSTRAP_ADMIN_PASSWORD:-}")
SEED_DEMO_USERS=$(env_quote "${SEED_DEMO_USERS:-false}")
DEMO_ADMIN_EMAIL=$(env_quote "${DEMO_ADMIN_EMAIL:-}")
DEMO_ADMIN_PASSWORD=$(env_quote "${DEMO_ADMIN_PASSWORD:-}")
DEMO_COUNTER_EMAIL=$(env_quote "${DEMO_COUNTER_EMAIL:-}")
DEMO_COUNTER_PASSWORD=$(env_quote "${DEMO_COUNTER_PASSWORD:-}")
DEMO_STAFF_EMAIL=$(env_quote "${DEMO_STAFF_EMAIL:-}")
DEMO_STAFF_PASSWORD=$(env_quote "${DEMO_STAFF_PASSWORD:-}")
DEMO_KITCHEN_EMAIL=$(env_quote "${DEMO_KITCHEN_EMAIL:-}")
DEMO_KITCHEN_PASSWORD=$(env_quote "${DEMO_KITCHEN_PASSWORD:-}")
EOF

"${scp_base[@]}" "$env_file" "${SSH_USER}@${SSH_HOST}:${remote_root}/.env"

"${ssh_base[@]}" "cd '${remote_root}' && \
  chmod 600 .env && \
  rm -rf repo.previous && \
  if [ -d repo ]; then mv repo repo.previous; fi && \
  mkdir -p repo && \
  tar -xzf release.tgz -C repo && \
  rm -f release.tgz && \
  set -a && . ./.env && set +a && \
  docker compose --env-file .env -f repo/deploy/docker-compose.java.yml -p '${COMPOSE_PROJECT_NAME}' up -d --build postgres && \
  docker compose --env-file .env -f repo/deploy/docker-compose.java.yml -p '${COMPOSE_PROJECT_NAME}' --profile migrate run --rm --build migrate && \
  docker compose --env-file .env -f repo/deploy/docker-compose.java.yml -p '${COMPOSE_PROJECT_NAME}' up -d --build --remove-orphans && \
  bash repo/deploy/scripts/backup-postgres.sh pre-health-check && \
  bash repo/deploy/scripts/write-nginx-config.sh && \
  bash repo/deploy/scripts/health-check.sh"
