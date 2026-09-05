<!-- Điền ngắn gọn để reviewer và CI/CD hiểu thay đổi. -->

## Mục tiêu

<!-- Thay đổi này làm gì và vì sao? Link issue nếu có. -->

## Loại thay đổi

- [ ] feat (tính năng mới)
- [ ] fix (sửa lỗi)
- [ ] refactor / chore
- [ ] docs
- [ ] ci/devops

## Phạm vi ảnh hưởng

- [ ] Backend (Java / Spring Boot)
- [ ] Frontend (React apps)
- [ ] Mobile (React Native / Expo)
- [ ] Hạ tầng / CI-CD
- [ ] Database (có migration?)

## Kiểm thử

<!-- Đã chạy gì để chứng minh thay đổi hoạt động? -->

- [ ] `./gradlew test` (backend Java)
- [ ] `npm run build` (frontend)
- [ ] `npm test` trong `mobile-rn/` (mobile)
- [ ] Kiểm thử thủ công luồng liên quan

## Ghi chú triển khai

<!-- Có breaking change / cần biến môi trường mới / cần migration DB / ảnh hưởng deploy không? -->

## Checklist

- [ ] CI xanh (build + test + security)
- [ ] Đã cập nhật tài liệu nếu đổi API/hợp đồng
- [ ] Không commit secret hay file cục bộ
