#!/usr/bin/env bash
#
# Đóng gói MỌI THỨ không dựng lại được, để mang sang máy chủ mới.
#
# Chạy TRÊN MÁY CHỦ CŨ, trước khi nó hết hạn:
#
#     bash dong-goi-chuyen-may.sh
#     # rồi trên máy cá nhân:
#     scp <user>@<máy-cũ>:~/cmc-chuyen-may-*.tar.gz .
#
# ---------------------------------------------------------------------------
# CÁI GÌ CẦN MANG, VÀ VÌ SAO CHỈ CÓ NGẦN NÀY
#
# Gần như toàn bộ hệ thống dựng lại được từ kho mã và từ GitHub Environments. Thứ KHÔNG dựng lại
# được chỉ có hai, và cả hai đều là trạng thái sinh ra lúc chạy:
#
#   1. Cơ sở dữ liệu PRODUCTION  — đơn hàng, điểm hội viên, tài khoản quản trị, bản ghi SePay
#   2. Cơ sở dữ liệu STAGING     — ít quan trọng hơn, nhưng rẻ nên lấy luôn
#
# Script này chỉ biết tới hệ thống nhà hàng. Dịch vụ nào khác của chủ máy cũng đang chạy trên
# cùng máy chủ thì tự lo phần của nó — kho mã này không đụng tới, không sao lưu hộ.
#
# Thứ KHÔNG cần mang, để khỏi mất công:
#
#   - 91 ảnh món      nằm trong kho mã (`frontend/public/menu-images`), dựng lại theo ảnh Docker
#   - chứng chỉ TLS   certbot xin lại sau khi DNS trỏ sang máy mới; mang sang cũng vô ích vì
#                     Let's Encrypt xác minh theo tên miền chứ không theo máy
#   - cấu hình nginx  `write-nginx-config.sh` sinh lại mỗi lượt triển khai
#   - secrets / vars  nằm trong GitHub Environments, không nằm trên máy
#
# Tệp `.env` của mỗi môi trường ĐƯỢC lấy kèm, nhưng chỉ để đối chiếu: mỗi lượt triển khai tự ghi
# đè chúng từ GitHub. Nó có ích đúng một việc — nếu một secret từng đặt tay rồi quên, đây là bản
# duy nhất còn lại. Vì thế tệp gói ra CHỨA BÍ MẬT: đừng đẩy lên kho mã, đừng gửi qua chat.
# ---------------------------------------------------------------------------
set -euo pipefail

dau_ra="${HOME}/cmc-chuyen-may-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "${dau_ra}"

echo "==> Gói vào ${dau_ra}"
echo

# Tên container KHÔNG viết cứng. Compose đặt tên theo project, và đoán sai tên là dump ra tệp rỗng
# mà lệnh vẫn trả về 0 — hỏng im lặng, đúng loại nguy nhất ở một việc chỉ làm được một lần.
tim_postgres() {
  docker ps --filter "name=${1}" --filter "name=postgres" --format '{{.Names}}' | head -1
}

dump_mot_moi_truong() {
  local ten_project="$1" nhan="$2"
  local container
  container="$(tim_postgres "${ten_project}")"

  if [ -z "${container}" ]; then
    echo "  BỎ QUA ${nhan}: không thấy container postgres nào của '${ten_project}'"
    return 0
  fi

  # Đọc user/db từ chính container thay vì đoán: hai môi trường có thể khai khác nhau.
  local user db
  user="$(docker exec "${container}" printenv POSTGRES_USER)"
  db="$(docker exec "${container}" printenv POSTGRES_DB)"

  echo "  ${nhan}: ${container}  (user=${user} db=${db})"
  docker exec -t "${container}" \
    pg_dump -U "${user}" -d "${db}" --format=custom --no-owner --no-acl \
    > "${dau_ra}/${nhan}.dump"

  # Một dump rỗng trông y hệt một dump thành công cho tới lúc khôi phục — mà lúc đó máy cũ đã mất.
  local kich_thuoc
  kich_thuoc="$(stat -c %s "${dau_ra}/${nhan}.dump")"
  if [ "${kich_thuoc}" -lt 1000 ]; then
    echo "  HỎNG: ${nhan}.dump chỉ ${kich_thuoc} byte — dừng lại, đừng tin gói này." >&2
    exit 1
  fi
  echo "     -> ${nhan}.dump  ($(numfmt --to=iec "${kich_thuoc}" 2>/dev/null || echo "${kich_thuoc} byte"))"
}

echo "==> Cơ sở dữ liệu"
dump_mot_moi_truong "cmc-restaurant-production" "production"
dump_mot_moi_truong "cmc-restaurant-staging" "staging"
echo

echo "==> Tệp .env (CHỨA BÍ MẬT — chỉ để đối chiếu)"
for moi_truong in production staging; do
  duong_dan="/opt/cmc-restaurant/${moi_truong}/.env"
  if [ -f "${duong_dan}" ]; then
    cp "${duong_dan}" "${dau_ra}/${moi_truong}.env"
    echo "  ${duong_dan} -> ${moi_truong}.env"
  else
    echo "  không có ${duong_dan}"
  fi
done
echo

# Ghi lại phiên bản đang chạy. Khôi phục dữ liệu của một bản mới hơn vào mã cũ hơn là cách chắc
# chắn để Flyway từ chối khởi động, và lúc đó không ai nhớ máy cũ đang chạy commit nào.
echo "==> Ảnh chụp phiên bản đang chạy"
{
  echo "Đóng gói lúc: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "Máy: $(hostname)  $(uname -sr)"
  echo
  echo "--- container ---"
  docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'
  echo
  echo "--- commit đang chạy ---"
  for m in production staging; do
    if [ -d "/opt/cmc-restaurant/${m}/repo/.git" ]; then
      echo "${m}: $(git -C "/opt/cmc-restaurant/${m}/repo" rev-parse --short HEAD 2>/dev/null || echo '?')"
    fi
  done
} > "${dau_ra}/hien-trang.txt"
cat "${dau_ra}/hien-trang.txt"
echo

goi="${dau_ra}.tar.gz"
tar czf "${goi}" -C "$(dirname "${dau_ra}")" "$(basename "${dau_ra}")"
rm -rf "${dau_ra}"

echo "==================================================================="
echo "XONG: ${goi}"
echo "      $(du -h "${goi}" | cut -f1)"
echo
echo "Kéo về máy cá nhân NGAY, đừng để trên máy sắp hết hạn:"
echo "  scp $(whoami)@$(hostname -I 2>/dev/null | awk '{print $1}'):${goi} ."
echo
echo "Gói này CHỨA BÍ MẬT (mật khẩu CSDL, khoá ký JWT)."
echo "Đừng đẩy lên kho mã, đừng gửi qua chat."
echo "==================================================================="
