# Chính Sách Bảo Mật

## Phiên bản được hỗ trợ

| Phiên bản | Hỗ trợ |
| --- | --- |
| 0.1.x | ✅ |

## Báo cáo lỗ hổng

Vui lòng **không** mở issue công khai cho lỗ hổng bảo mật.

- Gửi báo cáo riêng tư qua [GitHub Security Advisories](https://github.com/Anpham120/restaurant-qr-ordering-mobile/security/advisories/new), hoặc
- Liên hệ trưởng nhóm dự án.

Khi báo cáo, mô tả bước tái hiện, phạm vi ảnh hưởng và phiên bản/commit liên quan.
Chúng tôi sẽ phản hồi trong thời gian sớm nhất.

## Quản lý secrets

- Không commit secrets vào mã nguồn. Mọi khóa/bí mật nạp qua biến môi trường và
  GitHub Environments (`staging`, `production`).
- `.env` thực tế bị ignore; chỉ commit `.env.example` với placeholder. `VITE_*`
  là public build-time config, không được đặt token/password/API key.
- Tài khoản demo chỉ bật khi đặt `SEED_DEMO_USERS=true` (local/dev).
- Admin khởi tạo qua `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`.
- Xoay vòng định kỳ `JWT_SIGNING_KEY` và mật khẩu PostgreSQL.

## Enforcement

- Role trong frontend chỉ phục vụ UX. Backend JWT + `RequireAuthorization` là
  nguồn quyền duy nhất; sửa localStorage/DevTools không cấp API access.
- Frontend không có database client. PostgreSQL chỉ mở loopback/container network
  ở tầng ứng dụng, nên RLS không thay thế authorization của API single-tenant này.
- Password lưu PBKDF2-HMAC-SHA256 có salt; API không trả password hash.
- Admin table QR, management API, payment confirm/refund đều có server-side role
  check. Customer order/session dùng capability token riêng.
