#!/usr/bin/env bash
# Dựng sẵn một tài khoản khách để kiểm thử tính năng khách quen trên THIẾT BỊ THẬT.
#
#   scripts/seed-thiet-bi-that.sh                 # tạo tài khoản mới, hạng Vàng, 1200 điểm
#   scripts/seed-thiet-bi-that.sh 0912345678      # dùng số điện thoại tự chọn
#
# Vì sao cần: một tài khoản vừa đăng ký có 0 điểm và hạng Bạc, nên màn "Điểm thưởng" gần như
# trống — không ưu đãi nào đổi được, không phiếu nào, thanh tiến độ ở 0%. Nhìn vào đó không kết
# luận được gì về việc tính năng chạy đúng hay sai.
#
# Script in ra sẵn mọi thứ cần gõ vào điện thoại. Nó KHÔNG đụng gì ngoài một tài khoản và một
# hồ sơ tích điểm mới tạo.
set -euo pipefail

API="${API:-http://localhost:8081}"
DB=cmc-restaurant-java-local-postgres-1
# 10 chữ số: "09" + 6 chữ số giờ-phút-giây + 2 chữ số ngẫu nhiên. Đếm sai ở đây cho ra số 9
# chữ số — backend vẫn nhận, nhưng nó hiện lên màn hình khách và trông như dữ liệu hỏng.
PHONE="${1:-09$(date +%H%M%S)$(printf %02d $(( RANDOM % 100 )))}"
EMAIL="thu.$(date +%s)@local.test"
MATKHAU="ThuNghiem#123"

if ! docker exec "$DB" true 2>/dev/null; then
  echo "Không thấy container $DB. Chạy trước:" >&2
  echo "  docker compose -f deploy/docker-compose.java.yml -p cmc-restaurant-java-local up -d" >&2
  exit 1
fi

psql() { docker exec "$DB" psql -U restaurant_user -d restaurant_qr -tAc "$1"; }

# Thư mục tạm cạnh script, và mọi lệnh Node chạy TRONG nó với tên tệp tương đối.
#
# Không dùng mktemp và không truyền đường dẫn tuyệt đối cho Node: trên Windows, Git Bash nói
# "/tmp/x" hay "/c/AI/x" trong khi Node hiểu thành "C:\tmp\x" và "C:\c\AI\x" — hai thư mục không
# tồn tại. Lỗi hiện ra là ENOENT ở một đường dẫn trông rất hợp lý nên rất dễ đi tìm nhầm chỗ.
# Đường dẫn tương đối thì cả hai bên cùng hiểu, vì shell đã đặt đúng thư mục làm việc.
TMP=".tmp-seed"
mkdir -p "$TMP"
trap 'rm -rf "$TMP"' EXIT
cd "$TMP"

# Gửi JSON qua FILE chứ không qua -d: Git Bash làm hỏng chữ có dấu trong tham số dòng lệnh, và
# backend trả 400 "Invalid UTF-8 middle byte" — cũng là một lỗi trỏ sai hướng.
node -e "require('fs').writeFileSync('dk.json',JSON.stringify({fullName:'Khách Thử Nghiệm',email:'$EMAIL',password:'$MATKHAU'}),'utf8')"
curl -sS -X POST "$API/api/auth/register" -H 'Content-Type: application/json' --data-binary @dk.json -o /dev/null

node -e "require('fs').writeFileSync('dn.json',JSON.stringify({email:'$EMAIL',password:'$MATKHAU'}),'utf8')"
curl -sS -X POST "$API/api/auth/login" -H 'Content-Type: application/json' --data-binary @dn.json -o phien.json
TOKEN="$(node -e "console.log(require('./phien.json').accessToken)")"

curl -sS -X POST "$API/api/loyalty/me/phone" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$PHONE\"}" -o /dev/null

# Hạng Vàng chứ không phải Kim cương: Vàng còn có hạng kế tiếp, nên thanh tiến độ hiện số thật
# thay vì "Bạn đang ở hạng cao nhất" — và chính thanh đó là thứ cần nhìn.
psql "
insert into loyalty_members (id, phone_number, points, lifetime_spend, created_at, updated_at, tier, spend_12m, last_activity_at)
values ('loy_thu_$(date +%s)', '$PHONE', 1200, 8000000, now(), now(), 'VANG', 8000000, now())
on conflict (phone_number) do update set points = 1200, tier = 'VANG', spend_12m = 8000000;
" > /dev/null

IP="$(node -e "
const os=require('os');
const ds=Object.values(os.networkInterfaces()).flat()
  .filter(i=>i && i.family==='IPv4' && !i.internal && !i.address.startsWith('169.254.'));
console.log(ds.length ? ds[0].address : 'KHONG-TIM-DUOC-IP');
")"

cat <<THONGTIN

════ Gõ vào điện thoại ════

  Địa chỉ API      $IP:8081
  Email            $EMAIL
  Mật khẩu         $MATKHAU
  Mã QR bàn        http://$IP:8080/table/T01?qr=cmc-table-t01-qr

  Tài khoản này: hạng Vàng, 1200 điểm, chi tiêu 12 tháng 8.000.000đ
  (còn 7.000.000đ nữa lên Kim cương — thanh tiến độ phải hiện khoảng 53%)

THONGTIN
