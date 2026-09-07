# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Fork cá nhân, đặt lại phạm vi quanh hai mảng: **hạ tầng triển khai** và **nghiệp vụ đặt món**.

### Chuyển sang mô hình quán

Hệ thống chuyển từ **nhà hàng** sang **quán nước — kem — chè — ăn nhanh**. Phạm vi và các
quyết định còn chờ duyệt: `docs/pm/CHOT_NGHIEP_VU_QUAN_P0.md`.

- **Hai kênh nhận món**: `DineIn` và `Takeaway`. `Pickup` đổi tên thành `Takeaway` vì từ cũ gợi
  ý "đặt trước rồi tới lấy" — đúng thứ vừa bị loại khỏi phạm vi.
- **Gỡ giao tận nhà**: tài xế, phí ship, toạ độ, biểu phí, COD giao hàng và `POST /api/shop/quote`.
  Migration `V32` **dừng và bắt người xem** nếu còn đơn `Delivery` trong cơ sở dữ liệu, thay vì
  âm thầm đổi chúng thành đơn mang về — một đơn giao tận nhà có địa chỉ, có phí ship và có thể
  đã thu tiền, biến nó thành đơn mang về là làm sai chứng từ tiền.
- **Ba vai trò**: Khách hàng, Nhân viên quầy, Quản lý. Không có vai bếp — người pha chế chính là
  người đứng quầy. `Staff` và `Kitchen` chỉ còn để **đọc** tài khoản cũ, không cấp mới.
- **Gỡ toàn bộ giao diện web của mô hình nhà hàng** (356 tệp) cùng 103 ảnh món ăn và hai app
  stub `staff-web`, `kitchen-web`. Ba ứng dụng còn lại dựng một màn hình giữ chỗ trong lúc giao
  diện quán được dựng lại.

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
