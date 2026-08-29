# Triển khai lên máy chủ

Triển khai qua GitHub Actions (`.github/workflows/cd.yml`), bấm tay, không tự chạy theo push.

Máy chủ và tên miền dùng trong tài liệu này:

| | |
|---|---|
| Máy chủ mới | `221.121.2.60` |
| API + webhook | `api-staging.cmcrestaurant.app` |
| Web đặt món | `order-staging.cmcrestaurant.app` |
| Web giới thiệu | `staging.cmcrestaurant.app` |
| Nhân viên / bếp / quản trị | `staff-staging.*`, `kitchen-staging.*`, `admin-staging.*` |

**Chỉ cần 2 tên miền để test app**: `api-staging` (app và SePay gọi vào) và `order-staging` (web đặt
món). Ba cái còn lại chỉ cần khi test màn nhân viên.

---

## 0. Đổi DNS sang máy mới

Các bản ghi A hiện trỏ về máy cũ `167.172.83.59`. Đổi sang `221.121.2.60`:

```
api-staging.cmcrestaurant.app      A   221.121.2.60
order-staging.cmcrestaurant.app    A   221.121.2.60
staging.cmcrestaurant.app          A   221.121.2.60
```

TTL đang là 300 giây nên đổi xong chờ khoảng 5 phút. Kiểm tra:

```bash
dig +short api-staging.cmcrestaurant.app
# 221.121.2.60
```

---

## 1. Chuẩn bị máy chủ

```bash
curl -fsSL https://get.docker.com | sh
sudo apt install -y nginx certbot
```

Tường lửa — **không mở 8081, không mở 5432**:

```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

Tạo khoá SSH cho GitHub Actions dùng (chạy trên máy cá nhân):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/cmc-deploy -N ""
ssh-copy-id -i ~/.ssh/cmc-deploy.pub <user>@221.121.2.60
```

Nội dung `~/.ssh/cmc-deploy` (khoá riêng) sẽ đưa vào secret `SSH_KEY`.

---

## 2. Khai báo trong GitHub

`Settings → Environments → New environment → staging`

Bật **Required reviewers** nếu muốn phải bấm duyệt trước mỗi lần triển khai.

### Secrets

| Tên | Giá trị |
|---|---|
| `SSH_HOST` | `221.121.2.60` |
| `SSH_USER` | user ssh trên máy chủ |
| `SSH_KEY` | nội dung `~/.ssh/cmc-deploy` |
| `POSTGRES_PASSWORD` | `openssl rand -base64 48` |
| `JWT_SIGNING_KEY` | `openssl rand -base64 48` |
| `AI_INTERNAL_TOKEN` | `openssl rand -base64 48` |
| `PAYMENTS_SEPAY_APIKEY` | khoá webhook SePay |
| `FIREBASE_API_KEY` | Web API Key của dự án Firebase |
| `LLM_API_KEY` | khoá mô hình ngôn ngữ |

> `JWT_SIGNING_KEY` mặc định trong mã là `dev-only-signing-key-change-me-before-any-real-deploy`.
> Để nguyên chuỗi đó trên máy công khai nghĩa là **ai cũng ký được token giả** và vào bằng vai quản
> trị. Compose bắt buộc khai biến này nên không bỏ sót được, nhưng phải là chuỗi ngẫu nhiên thật.

### Variables

```
COMPOSE_PROJECT_NAME  = cmc-restaurant-staging
FRONTEND_PORT         = 8081
BACKEND_PORT          = 5001
POSTGRES_PORT         = 5433
BACKEND_JAVA_BIND     = 127.0.0.1

POSTGRES_DB           = restaurant_qr
POSTGRES_USER         = restaurant_user

FRONTEND_SERVER_NAMES = staging.cmcrestaurant.app order-staging.cmcrestaurant.app admin-staging.cmcrestaurant.app staff-staging.cmcrestaurant.app kitchen-staging.cmcrestaurant.app
API_SERVER_NAME       = api-staging.cmcrestaurant.app
PUBLIC_API_BASE_URL   = https://api-staging.cmcrestaurant.app/api
CORS_ALLOWED_ORIGINS  = https://staging.cmcrestaurant.app;https://order-staging.cmcrestaurant.app;https://admin-staging.cmcrestaurant.app;https://staff-staging.cmcrestaurant.app;https://kitchen-staging.cmcrestaurant.app

PAYMENTS_VIETQR_BANKID        = <mã ngân hàng>
PAYMENTS_VIETQR_ACCOUNTNUMBER = <số tài khoản nhận tiền>
PAYMENTS_VIETQR_ACCOUNTNAME   = <tên chủ tài khoản>

FIREBASE_PROJECT_ID   = <project id>
GOOGLE_CLIENT_ID      = <web client id>.apps.googleusercontent.com

AI_SERVICE_URL        = http://ai-service:8001
LLM_MODEL             = <tên mô hình>
```

`BACKEND_JAVA_BIND = 127.0.0.1` quan trọng hơn vẻ ngoài: mặc định compose mở cổng 8081 cho **mọi
giao diện** vì máy phát triển cần điện thoại thật gọi vào qua IP LAN. Trên máy chủ công khai, để
nguyên nghĩa là gọi thẳng `http://221.121.2.60:8081` được — **đi vòng qua nginx, tức đi vòng qua
TLS**, và khoá webhook SePay sẽ đi qua mạng ở dạng chữ thường.

Thiếu bất kỳ biến nào thì `deploy-vps.sh` thoát ngay và in ra tên biến đó. `DeploymentConfigTest`
đã canh việc `cd.yml` cấp đủ mọi tên, nên lỗi thiếu chỉ có thể do quên khai trong GitHub.

---

## 3. Triển khai lần đầu — HTTP trước

Chứng chỉ Let's Encrypt phải xin **qua cổng 80 của chính nginx này**, nên không thể bật TLS ngay từ
đầu: nginx sẽ từ chối khởi động vì khối 443 trỏ vào chứng chỉ chưa tồn tại.

`Actions → cd → Run workflow → staging`

Workflow sẽ chạy lại toàn bộ phép kiểm trước khi đụng máy chủ, rồi mới ssh vào.

Sau đó dựng nginx HTTP thuần trên máy chủ:

```bash
export DEPLOY_ENV=staging FRONTEND_PORT=8081 BACKEND_PORT=5001
export FRONTEND_SERVER_NAMES="staging.cmcrestaurant.app order-staging.cmcrestaurant.app"
export API_SERVER_NAME=api-staging.cmcrestaurant.app
sudo -E /opt/cmc-restaurant/staging/deploy/scripts/write-nginx-config.sh
```

Kiểm tra:

```bash
curl http://api-staging.cmcrestaurant.app/api/health
# {"status":"ok"}
```

---

## 4. Xin chứng chỉ rồi bật TLS

```bash
sudo certbot certonly --webroot -w /var/www/html \
  -d staging.cmcrestaurant.app \
  -d order-staging.cmcrestaurant.app \
  -d api-staging.cmcrestaurant.app

export TLS_CERT_DIR=/etc/letsencrypt/live/staging.cmcrestaurant.app
sudo -E /opt/cmc-restaurant/staging/deploy/scripts/write-nginx-config.sh
```

Sau bước này cổng 80 chỉ còn hai việc: phục vụ thử thách ACME để gia hạn, và đẩy sang HTTPS.

```bash
curl https://api-staging.cmcrestaurant.app/api/health
curl -I http://api-staging.cmcrestaurant.app/api/health   # phải trả 301
```

---

## 5. Trỏ SePay vào

- URL: `https://api-staging.cmcrestaurant.app/api/payments/webhooks/sepay`
- Xác thực: **API Key**, khoá trùng `PAYMENTS_SEPAY_APIKEY`

Bấm **Gửi thử** → mong đợi `success: true`.
Sai khoá → `SEPAY_KEY_INVALID`. Chưa điền khoá → `SEPAY_WEBHOOK_NOT_CONFIGURED`.

---

## 6. Trỏ app di động vào

Trong app, mục **Máy chủ**: `https://api-staging.cmcrestaurant.app`

Từ đây điện thoại không cần cùng wifi với máy chủ nữa.

---

## Cập nhật về sau

`Actions → cd → Run workflow → staging`. Không cần ssh vào máy.

Migration chạy ở bước `migrate` riêng và phải xong trước khi API khởi động — compose đã ràng buộc
thứ tự đó.

Sao lưu / khôi phục / quay lui: `deploy/scripts/backup-postgres.sh`, `restore-postgres.sh`,
`rollback-vps.sh`.

---

## Vì sao CD không tự chạy theo push

`cd.yml` chỉ chạy khi bấm tay, và có ba lớp chặn:

1. `workflow_dispatch` — phải chọn môi trường một cách có ý thức
2. `environment:` — bật Required reviewers là phải có người duyệt
3. Chạy lại `test integrationTest` **trước khi** đụng máy chủ, không tin vào lần CI cũ: nhánh có
   thể đã đổi sau khi CI xanh, và thứ được triển khai là mã đang có chứ không phải mã lúc CI chạy

`cancel-in-progress: false`: cắt ngang giữa lúc chạy migration để lại cơ sở dữ liệu ở trạng thái
nửa vời, thứ mà một lần triển khai lại **không sửa được**.

Địa chỉ máy chủ không ghi cứng ở đâu trong repo — lấy từ secrets. Một địa chỉ nằm trong tệp là địa
chỉ ai sửa cũng được mà không ai duyệt.

---

## Vì sao có `DeploymentConfigTest`

Tên biến ở tệp triển khai phải khớp tên máy chủ thật sự đọc. Sai một cái tên thì **không có gì sập**
— máy chủ chạy bình thường, webhook trả 401, mã QR báo thiếu cấu hình, và không có gì chỉ ra nguyên
nhân.

Ba lỗi có thật đã sống nhờ chỗ trống này:

- `deploy-vps.sh` ghi `PAYMENTS__VIETQR__BANKID` (hai gạch dưới, quy ước .NET còn sót) trong khi máy
  chủ đọc `PAYMENTS_VIETQR_BANKID` — cấu hình VietQR **chưa bao giờ** tới được backend Java.
- Ba khoá thêm về sau (SePay, Firebase, Google) không được liệt kê trong compose, nên không vào
  container dù đã khai đúng ở `.env`.
- Workflow triển khai và phép kiểm canh nó đều đã biến mất khỏi repo, chỉ còn script với 27 biến bắt
  buộc — thiếu một biến thì script thoát giữa chừng, **sau khi đã qua cửa duyệt**.

Thêm khoá cấu hình mới thì nhớ thêm vào `PHAI_TRUYEN_DUOC` trong
`backend-java/src/test/java/com/cmc/restaurant/DeploymentConfigTest.java`.
