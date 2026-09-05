# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Fork cá nhân, đặt lại phạm vi quanh hai mảng: **hạ tầng triển khai** và **nghiệp vụ đặt món**.

### Added
- **Trạng thái theo từng món** — bếp cập nhật từng món, khách thấy đúng món nào đã lên thay vì
  một trạng thái chung cho cả đơn.
- **Ước lượng thời gian lên món theo từng bếp** — bếp nấu, quầy pha chế và hàng lấy sẵn có hàng đợi riêng
  và số việc song song riêng (`KITCHEN_PARALLEL_DISHES`, `KITCHEN_PARALLEL_BAR_ITEMS`).
- **Bếp tự khai độ trễ** — nhập số phút cộng thêm khi có việc mà hệ thống không thấy được (hỏng
  lò, thiếu người, đoàn đặt trước). Chỉ áp cho món của bếp.
- **Ca quầy** — mở ca, ghi thu chi trong ca, chốt ca và đối chiếu tiền mặt.
- **Đổi điểm tại quầy** — điểm chỉ trừ khi ưu đãi thật sự được giao.
- **App khách hàng thân thiết** (Expo / React Native) — khách tự tạo tài khoản và tự gắn số điện
  thoại, không cần nhân viên nối hộ.
- **Job CI `realtime-e2e`** — chạy chính mã client STOMP của frontend với backend thật.

### Changed
- **Backend chuyển sang Java 21 / Spring Boot** với Spring Data JPA và Flyway; realtime chuyển từ
  SignalR sang **STOMP over WebSocket**.
- **Thanh toán ăn tại bàn chốt bằng hoá đơn bàn**, không phải trả từng đơn.
- **Đối soát tiền tự động qua webhook SePay** thay cho việc nhân viên bấm xác nhận.

### Removed
- **Trợ lý tư vấn thực đơn** cùng toàn bộ hạ tầng đi kèm. Lý do: nhóm không đủ kiến thức và hạ
  tầng để tiếp tục phát triển phần này cho tới nơi, nên phạm vi được thu lại để làm sâu hai mảng
  còn lại. Bảng dữ liệu liên quan bị migration **V28** xoá.
- **Tính năng nhân viên nối tài khoản hộ khách** — thay bằng khách tự nối.

### Known Issues
- Sao lưu cơ sở dữ liệu **đã có script nhưng chưa được khôi phục thử**. Một bản sao lưu chưa từng
  khôi phục là một giả định, không phải một bảo đảm.
- Chưa có log tập trung và cảnh báo; quan trắc mới dừng ở kiểm sức khoẻ sau triển khai.
- Trước khi triển khai thật: đặt `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD`, xoay
  `JWT_SIGNING_KEY` và mật khẩu PostgreSQL. Dữ liệu mẫu chỉ dành cho máy cá nhân.
