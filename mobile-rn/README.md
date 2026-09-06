# Mây mobile

Giao diện React Native mới cho khách hàng và nhân viên giao hàng nội bộ. `App.tsx` chỉ dựng `src/shop/MayApp.tsx`; toàn bộ giao diện nhà hàng cũ dưới `src/ui` đã được loại bỏ. `src/core` và các test nghiệp vụ cũ được giữ như thư viện không giao diện.

## Chạy

```sh
npm ci
npm start
```

Mở **Tài khoản → Kết nối máy chủ** hoặc thiết lập `EXPO_PUBLIC_API_BASE_URL=https://api.example.com` trước khi chạy Expo. Trên thiết bị thật, dùng địa chỉ LAN hoặc HTTPS truy cập được từ thiết bị; `localhost` là chính điện thoại. Địa chỉ cấu hình là origin, không gồm `/api`.

Không có dữ liệu mẫu tự động. Khi backend chưa chạy, app hiện lỗi và nút thử lại. Khách đặt món không cần đăng nhập; tài khoản có role `Courier` mở trực tiếp công việc giao hàng. Cấu hình quán, thực đơn và phí giao đều lấy từ API.

## Luồng chính

- Khách: thực đơn/tìm kiếm → chọn size, đường/đá, topping theo cấu hình backend → giỏ tách từng cấu hình → nhận quầy hoặc giao hàng → VietQR hoặc COD → theo dõi trạng thái.
- Giao hàng: đơn được phân công → kiểm túi hàng và nhận khi `Ready` → chỉ đường/gọi khách → xác nhận giao đủ món hoặc báo không giao được. COD bắt buộc nhập đúng số tiền đã thu.
- Giao tận nơi: cấp quyền vị trí hiện tại hoặc nhập toạ độ → xác nhận địa chỉ trùng điểm bản đồ → server báo phí → server tính lại phí lúc đặt đơn. Đổi điểm hoặc địa chỉ làm báo phí cũ hết hiệu lực.

Token đăng nhập và quyền xem đơn được lưu qua Keychain/Keystore. Mỗi máy chủ có vùng lưu riêng. Bản web xem thử giữ token trong `sessionStorage`, nên đóng phiên trình duyệt sẽ mất lịch sử khách vãng lai. Đăng xuất xoá lịch sử trên thiết bị; dữ liệu đơn vẫn ở backend. API nhận idempotency key cho đặt đơn và yêu cầu thanh toán.

## Kiểm chứng

```sh
npm run typecheck
npm test -- --runInBand
npm run lint
npx expo export --platform web
```

Luồng cấp quyền vị trí, gọi điện, mở bản đồ, cỡ chữ hệ thống, safe area và giao hàng thực tế cần kiểm thử trên Android/iOS trước khi phát hành. Chuyển khoản chỉ hiện thành công khi backend xác nhận đã nhận tiền. App dùng giao diện sáng; không tự đảo màu theo dark mode hệ thống.

Giữ nguyên bundle identifier và EAS project để bảo toàn nhận diện bản cài. Tên hiển thị đổi thành Mây, deep link mới `may://orders/MA_DON`; chỉ mở được đơn có token trên thiết bị. Icon Mây mới nằm tại `assets/may-icon.png`; toàn bộ icon và giao diện cũ đã được loại bỏ.
