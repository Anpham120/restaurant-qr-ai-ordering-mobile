# Triển khai lên máy chủ riêng

Triển khai thủ công, chưa dùng CI/CD.

> **Máy chủ RIÊNG của bạn, không phải VPS chung của nhóm.** VPS chung đang phục vụ điểm của bốn
> bạn khác — không trỏ webhook, không chạy compose, không đụng gì vào đó.

---

## 0. Chuẩn bị trên máy chủ

```bash
# Docker + compose plugin
curl -fsSL https://get.docker.com | sh

# nginx làm cổng vào, certbot để xin chứng chỉ
sudo apt install -y nginx certbot
```

Cần **hai tên miền** (hoặc hai tên miền con) trỏ về IP máy chủ:

| Dùng cho | Ví dụ |
|---|---|
| Web khách | `vian.example.com` |
| API + webhook | `api.vian.example.com` |

SePay gọi vào tên miền API, nên nó phải ra được Internet và có chứng chỉ hợp lệ.

---

## 1. Tệp môi trường

Chép mẫu rồi điền:

```bash
cp deploy/env/production.example.env deploy/.env
```

Những giá trị **bắt buộc** — thiếu là compose từ chối khởi động:

```dotenv
POSTGRES_PASSWORD=<chuỗi ngẫu nhiên dài>
JWT_SIGNING_KEY=<chuỗi ngẫu nhiên dài>
AI_INTERNAL_TOKEN=<chuỗi ngẫu nhiên dài>
```

Sinh nhanh: `openssl rand -base64 48`

> `JWT_SIGNING_KEY` mặc định trong mã là `dev-only-signing-key-change-me-before-any-real-deploy`.
> Để nguyên chuỗi đó trên máy chủ công khai nghĩa là **ai cũng ký được token giả** và vào bằng vai
> quản trị. Compose bắt buộc khai biến này nên không bỏ sót được — nhưng phải là chuỗi ngẫu nhiên
> thật, không phải chuỗi mẫu.

Những giá trị của dịch vụ ngoài — xem [cau-hinh-firebase-sepay.md](./cau-hinh-firebase-sepay.md):

```dotenv
PAYMENTS_SEPAY_APIKEY=…
PAYMENTS_VIETQR_BANKID=…
PAYMENTS_VIETQR_ACCOUNTNUMBER=…
PAYMENTS_VIETQR_ACCOUNTNAME=…
FIREBASE_API_KEY=…
FIREBASE_PROJECT_ID=…
GOOGLE_CLIENT_ID=…
```

Và phần riêng của máy chủ công khai:

```dotenv
BACKEND_JAVA_BIND=127.0.0.1
CORS_ALLOWED_ORIGINS=https://vian.example.com
FRONTEND_SERVER_NAMES=vian.example.com
API_SERVER_NAME=api.vian.example.com
PUBLIC_API_BASE_URL=https://api.vian.example.com/api
```

### `BACKEND_JAVA_BIND` quan trọng hơn vẻ ngoài

Mặc định compose mở cổng 8081 cho **mọi giao diện**, vì máy phát triển cần điện thoại thật gọi vào
qua IP LAN. Trên máy chủ công khai, để nguyên nghĩa là gọi thẳng `http://<ip>:8081` được — **đi
vòng qua nginx, tức đi vòng qua TLS**, và khoá webhook SePay sẽ đi qua mạng ở dạng chữ thường.

Đặt `127.0.0.1` thì chỉ nginx vào được.

---

## 2. Triển khai lần đầu — HTTP trước

Chứng chỉ Let's Encrypt phải xin **qua cổng 80 của chính nginx này**, nên không thể bật TLS ngay
từ đầu: nginx sẽ từ chối khởi động vì khối 443 trỏ vào chứng chỉ chưa tồn tại.

```bash
# Dựng và chạy stack
docker compose -f deploy/docker-compose.java.yml --env-file deploy/.env up -d --build

# nginx HTTP thuần (chưa đặt TLS_CERT_DIR)
sudo -E deploy/scripts/write-nginx-config.sh
```

Kiểm tra:

```bash
curl http://api.vian.example.com/api/health
# {"status":"ok"}
```

---

## 3. Xin chứng chỉ, rồi bật TLS

```bash
sudo certbot certonly --webroot -w /var/www/html \
  -d vian.example.com -d api.vian.example.com

# Chạy lại script, lần này có chứng chỉ
export TLS_CERT_DIR=/etc/letsencrypt/live/vian.example.com
sudo -E deploy/scripts/write-nginx-config.sh
```

Sau bước này cổng 80 chỉ còn hai việc: phục vụ thử thách ACME để gia hạn, và đẩy sang HTTPS.

Kiểm tra:

```bash
curl https://api.vian.example.com/api/health
curl -I http://api.vian.example.com/api/health   # phải trả 301
```

---

## 4. Tường lửa

```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

Không mở 8081 và không mở 5432. Postgres vốn không phơi cổng nào trong compose, dịch vụ AI neo
`127.0.0.1` — hai chỗ đó đã đúng sẵn.

---

## 5. Trỏ SePay vào

Trong bảng điều khiển SePay, tạo webhook:

- URL: `https://api.vian.example.com/api/payments/webhooks/sepay`
- Xác thực: **API Key**, khoá trùng `PAYMENTS_SEPAY_APIKEY`

Bấm **Gửi thử** → mong đợi `success: true`.

Sai khoá → `SEPAY_KEY_INVALID`. Chưa điền khoá → `SEPAY_WEBHOOK_NOT_CONFIGURED`.

---

## 6. Trỏ app di động vào

Trong app, mục **Máy chủ**: `https://api.vian.example.com`

Từ lúc này điện thoại không cần cùng wifi với máy chủ nữa.

---

## Cập nhật về sau

```bash
git pull
docker compose -f deploy/docker-compose.java.yml --env-file deploy/.env up -d --build
```

Migration chạy ở bước `migrate` riêng và phải xong trước khi API khởi động — compose đã ràng buộc
thứ tự đó, không cần làm gì thêm.

Sao lưu và khôi phục: `deploy/scripts/backup-postgres.sh`, `restore-postgres.sh`.
Quay lui: `deploy/scripts/rollback-vps.sh`.

---

## Vì sao có `DeploymentConfigTest`

Tên biến ở tệp triển khai phải khớp tên máy chủ thật sự đọc. Sai một cái tên thì **không có gì sập**
— máy chủ chạy bình thường, webhook trả 401, mã QR báo thiếu cấu hình, và không có gì chỉ ra nguyên
nhân.

Hai lỗi có thật đã sống nhờ chỗ trống này:

- `deploy-vps.sh` ghi `PAYMENTS__VIETQR__BANKID` (hai gạch dưới, quy ước .NET còn sót) trong khi
  máy chủ đọc `PAYMENTS_VIETQR_BANKID` — cấu hình VietQR **chưa bao giờ** tới được backend Java khi
  triển khai.
- Ba khoá thêm về sau (SePay, Firebase, Google) không được liệt kê trong compose, nên chúng không
  vào container dù đã khai đúng ở `.env`.

Cả hai nay đều làm phép kiểm đỏ. Thêm khoá cấu hình mới thì nhớ thêm vào `PHAI_TRUYEN_DUOC` trong
`backend-java/src/test/java/com/cmc/restaurant/DeploymentConfigTest.java`.
