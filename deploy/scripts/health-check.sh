#!/usr/bin/env bash
# Phép kiểm sau deploy: dịch vụ vừa dựng có ĐANG phục vụ đúng cấu hình đã đo không.
#
# Kiểm hai thứ, theo thứ tự từ ngoài vào: web lên, API sống.
#
# KHÔNG kiểm `/health/ready` nữa: đường đó KHÔNG TỒN TẠI trong backend. Chỉ có `/api/health`, và
# SecurityConfig cũng chỉ mở đúng đường đó — nên `/health/ready` trả 401 chứ không phải 200.
#
# Nó nằm im suốt vì nhánh "bỏ qua khi profile AI tắt" thoát THÀNH CÔNG ngay trước bước này, mà
# production thì chưa bao giờ bật profile AI. Gỡ trợ lý đi là gỡ luôn nhánh đó, và một cấu hình
# chết từ lâu mới lộ ra bằng một lượt triển khai đỏ.
#
# Toàn bộ phần kiểm trợ lý AI đã gỡ cùng chính trợ lý — 312 dòng đối chiếu `/ready.retriever`,
# `generation_enabled` và ba ca khói ngữ nghĩa. Chúng canh một dịch vụ không còn tồn tại.
#
# Bài học giữ lại từ bản cũ, vì nó áp cho MỌI phép kiểm sau deploy: bản trước assert theo hợp đồng
# của một hệ thống đã bị thay, nên nó đỏ TRONG KHI dịch vụ hoàn toàn khoẻ. Một phép kiểm sau deploy
# đỏ sai lý do còn nguy hơn không có, vì nó che mất mọi thứ khác và người trực không biết phần gọi
# món vẫn tốt.

set -euo pipefail

: "${DEPLOY_ENV:?DEPLOY_ENV is required}"
: "${FRONTEND_SERVER_NAMES:?FRONTEND_SERVER_NAMES is required}"
: "${API_SERVER_NAME:?API_SERVER_NAME is required}"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"

primary_frontend_domain="$(printf '%s\n' "$FRONTEND_SERVER_NAMES" | awk '{print $1}')"
# Giao thức lấy từ PUBLIC_API_BASE_URL chứ KHÔNG ghi cứng https.
#
# Một bản triển khai chưa có chứng chỉ thì mọi thứ chạy trên http, và kiểm sức khoẻ gọi https
# sẽ báo "không kết nối được cổng 443" — nghe như hệ thống hỏng, trong khi nó đang chạy bình
# thường. Đo thật: cả stack lên xong, chỉ mỗi bước này đỏ.
giao_thuc="https"
case "${PUBLIC_API_BASE_URL:-}" in
  http://*) giao_thuc="http" ;;
esac

frontend_url="${FRONTEND_HEALTH_URL:-${giao_thuc}://${primary_frontend_domain}/}"
api_health_url="${API_HEALTH_URL:-${giao_thuc}://${API_SERVER_NAME}/api/health}"
api_chat_sessions_url="${API_CHAT_SESSIONS_URL:-${giao_thuc}://${API_SERVER_NAME}/api/chat/sessions}"


echo "Checking frontend: ${frontend_url}"
curl --fail --show-error --silent --retry 10 --retry-delay 5 --retry-all-errors "$frontend_url" >/dev/null

echo "Checking API health: ${api_health_url}"
curl --fail --show-error --silent --retry 10 --retry-delay 5 --retry-all-errors "$api_health_url"


report_dir="/opt/cmc-restaurant/${DEPLOY_ENV}/reports"
mkdir -p "$report_dir"
compose_file="/opt/cmc-restaurant/${DEPLOY_ENV}/repo/deploy/docker-compose.java.yml"
compose_status="not checked"
if [ -f "$compose_file" ] && [ -n "${COMPOSE_PROJECT_NAME:-}" ]; then
  compose_status="$(docker compose --env-file "/opt/cmc-restaurant/${DEPLOY_ENV}/.env" -f "$compose_file" -p "$COMPOSE_PROJECT_NAME" ps --format json 2>/dev/null || true)"
fi

cat > "${report_dir}/last-deployment.md" <<EOF
# Deployment Report

- Environment: ${DEPLOY_ENV}
- Frontend URL: ${frontend_url}
- API health URL: ${api_health_url}
- Checked at UTC: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
- Result: PASS

## Compose Status

\`\`\`json
${compose_status}
\`\`\`
EOF

echo "Health check passed for ${DEPLOY_ENV}"
