#!/usr/bin/env bash
# Chạy TOÀN BỘ kiểm thử tại máy, không cần cài JDK/Gradle.
#
#   scripts/test-all.sh              # backend + app di động + web
#   scripts/test-all.sh backend      # chỉ backend Java (gồm cả nhóm Testcontainers)
#   scripts/test-all.sh mobile       # chỉ mobile-rn
#   scripts/test-all.sh web          # chỉ frontend
#
# Backend chạy CẢ `test` lẫn `integrationTest`: hai task tách nhau để CI chặn merge dựa trên
# `test`, nên gọi thiếu một task là bỏ sót đúng phần chạm cơ sở dữ liệu thật.
#
# Vì sao cần script này thay vì gõ `gradle test`: Gradle chạy trong container (máy phát triển
# không có JDK), nên nhóm Testcontainers phải nói chuyện được với Docker của MÁY THẬT. Không có
# đúng bộ cờ dưới đây thì 26 test đó không chạy — và chúng KHÔNG đỏ, chúng chỉ lỗi khởi tạo với
# câu "Could not find a valid Docker environment", rất dễ bị bỏ qua như một hỏng hóc môi trường.
# Đã có một tính năng hỏng hẳn lọt qua vì đúng chuyện này.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PHAN="${1:-all}"

# Docker Desktop trên Windows cần MSYS_NO_PATHCONV, nếu không Git Bash biến /var/run/... thành
# đường dẫn Windows và ổ cắm không vào được container.
export MSYS_NO_PATHCONV=1

backend() {
  echo "══ backend Java ══"
  # --user root: ổ cắm Docker thuộc root, mà image gradle chạy bằng user `gradle`.
  # TESTCONTAINERS_HOST_OVERRIDE: Postgres do Testcontainers dựng là container ANH EM chứ không
  #   nằm trong container gradle, nên "localhost" trỏ sai chỗ; phải đi qua máy thật.
  # Phiên bản Docker Engine API đặt trong backend-java/build.gradle, không đặt ở đây.
  docker run --rm --user root \
    -v "$ROOT:/repo" \
    -v cmc-gradle-cache:/home/gradle/.gradle \
    -v //var/run/docker.sock:/var/run/docker.sock \
    --add-host host.docker.internal:host-gateway \
    -e DOCKER_HOST=unix:///var/run/docker.sock \
    -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal \
    -e GRADLE_USER_HOME=/home/gradle/.gradle \
    -w //repo/backend-java gradle:8.10.2-jdk21 \
    gradle --no-daemon test integrationTest
}

mobile() {
  echo "══ app di động ══"
  cd "$ROOT/mobile-rn"
  # tsc chạy riêng vì jest đi qua babel và KHÔNG kiểm kiểu — đã có hai lỗi thật lọt qua jest xanh.
  npx tsc --noEmit
  npx eslint src --max-warnings=0
  npx jest
}

web() {
  echo "══ web ══"
  cd "$ROOT/frontend"
  # Cần `npm ci` sau khi đổi nhánh: node_modules cũ làm typecheck báo hàng trăm lỗi giả về
  # "Cannot find module '@cmc/...'" và làm 9 tệp test đỏ, không liên quan gì tới mã.
  npm run typecheck
  npx vitest run
}

case "$PHAN" in
  backend) backend ;;
  mobile) mobile ;;
  web) web ;;
  all) backend; mobile; web ;;
  *) echo "Không hiểu '$PHAN'. Dùng: all | backend | mobile | web" >&2; exit 1 ;;
esac

echo
echo "══ xong ══"
