#!/usr/bin/env bash
# Chạy cả hệ thống tại máy.
#
#   scripts/run-all.sh              # native: JVM + uvicorn + Vite dev server, có hot reload
#   scripts/run-all.sh --docker     # dựng nguyên stack bằng Docker Compose, giống môi trường thật
#
# Chế độ `--docker` cần `deploy/.env`:
#
#   cp deploy/env/local.example.env deploy/.env
#
# Chế độ native cần một PostgreSQL đang chạy sẵn (xem biến DB_* bên dưới) — nó KHÔNG tự dựng CSDL.
# Dùng `--docker` nếu chỉ muốn xem hệ thống chạy mà không phải cài gì.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-native}"

if [[ "$MODE" == "--docker" ]]; then
  ENV_FILE="${2:-deploy/.env}"
  if [[ ! -f "$ROOT/$ENV_FILE" ]]; then
    echo "Thiếu $ENV_FILE. Chạy: cp deploy/env/local.example.env deploy/.env" >&2
    exit 1
  fi
  # `--profile migrate` chạy trước: schema do một bước RIÊNG migrate, không phải do API lúc boot.
  # Nhiều instance API cùng migrate một CSDL là loại lỗi chỉ xảy ra khi deploy thật.
  docker compose --env-file "$ROOT/$ENV_FILE" -f "$ROOT/deploy/docker-compose.java.yml" \
    --profile migrate run --rm migrate
  exec docker compose --env-file "$ROOT/$ENV_FILE" -f "$ROOT/deploy/docker-compose.java.yml" \
    up --build
fi

for file in "$ROOT/backend-java/.env" "$ROOT/frontend/.env"; do
  if [[ -f "$file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$file"
    set +a
  fi
done

# Spring đọc `SPRING_DATASOURCE_*`; dựng từ các biến DB_* rời cho ai quen đặt kiểu đó.
export SPRING_DATASOURCE_URL="${SPRING_DATASOURCE_URL:-jdbc:postgresql://${DB_HOST:-localhost}:${DB_PORT:-5432}/${DB_NAME:-restaurant_qr}}"
export SPRING_DATASOURCE_USERNAME="${SPRING_DATASOURCE_USERNAME:-${DB_USERNAME:-restaurant_user}}"
export SPRING_DATASOURCE_PASSWORD="${SPRING_DATASOURCE_PASSWORD:-${DB_PASSWORD:-}}"
export BACKEND_JAVA_PORT="${BACKEND_JAVA_PORT:-8081}"
export CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176,http://localhost:5177}"

if [[ -z "${JWT_SIGNING_KEY:-}" || ${#JWT_SIGNING_KEY} -lt 32 ]]; then
  echo "Đặt JWT_SIGNING_KEY (từ 32 ký tự ngẫu nhiên trở lên) trong backend-java/.env" >&2
  exit 1
fi
export JWT_SIGNING_KEY

pids=()
cleanup() {
  for pid in "${pids[@]:-}"; do kill "$pid" 2>/dev/null || true; done
}
trap cleanup EXIT INT TERM

# `bootRun` chứ không phải `java -jar`: nó biên dịch lại khi mã đổi, đúng thứ cần khi đang sửa.
(cd "$ROOT/backend-java" && ./gradlew bootRun) & pids+=("$!")
for portal in customer ordering ops; do
  (cd "$ROOT/frontend" && npm run "dev:$portal") & pids+=("$!")
done

echo "Đã chạy: API Java (:${BACKEND_JAVA_PORT}) và ba giao diện. Ctrl+C để dừng."
wait -n "${pids[@]}"
echo "Một tiến trình đã thoát; dừng những tiến trình còn lại." >&2
exit 1
