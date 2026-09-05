# Hướng Dẫn Đóng Góp

Cảm ơn bạn đã đóng góp cho **CMC Restaurant — QR Ordering**.

## Quy trình làm việc

1. Mỗi thay đổi xuất phát từ một **issue** (gắn nhãn vai trò `role:*` và mốc tuần).
2. Tạo nhánh từ `develop` theo dạng `<loại>/<mô-tả-ngắn>` (ví dụ `feat/menu-api`,
   `fix/login-layout`).
3. Mở **pull request vào `develop`**, liên kết issue (`Closes #<số>`), điền mô tả
   theo mẫu PR.
4. PR phải qua review và **CI xanh** (build + test frontend/backend + kiểm tra Docker
   Compose) trước khi merge.
5. Triển khai KHÔNG tự chạy theo push. Chạy workflow `cd` bằng tay, chọn `staging` hoặc
   `production`, và phải có người duyệt trước khi job chạm vào máy chủ.

## Quy ước commit

- Dùng [Conventional Commits](https://www.conventionalcommits.org/): `feat:`,
  `fix:`, `docs:`, `chore:`, `ci:`, `refactor:`, `test:`.
- Mô tả ngắn gọn, rõ "cái gì" và "vì sao".

## Chạy kiểm thử cục bộ

```bash
# Frontend
cd frontend && npm ci && npm run build

# Backend
cd backend-java && ./gradlew build
```

## Nguyên tắc

- Thay đổi tối thiểu, đúng phạm vi issue.
- Không commit secrets (xem [SECURITY.md](./SECURITY.md)).
- Cập nhật tài liệu/CHANGELOG khi thay đổi hành vi người dùng.
