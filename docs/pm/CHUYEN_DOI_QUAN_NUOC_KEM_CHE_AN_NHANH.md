# Kế hoạch chuyển đổi lõi — quán nước, kem, chè và đồ ăn nhanh

**Lập:** 06/09/2026  
**Trạng thái:** lát cắt nền tảng đang triển khai; các quyết định thương mại còn chờ chốt

## 1. Mục tiêu kỳ này

Mở rộng hệ thống tại bàn hiện tại để có thể nhận đơn mang đi và giao tận nhà mà không làm hỏng
luồng QR tại bàn. Giao tận nhà là kênh chính. Với đơn mang đi/giao tận nhà, quán chỉ bắt đầu chuẩn
bị sau khi hệ thống xác nhận đã nhận tiền.

Tài liệu nguồn được cung cấp ngày 06/09/2026 bị cắt giữa câu sau phần mở đầu. Vì vậy tài liệu này
chỉ chốt hai quy tắc trên; các mục chưa đủ thông tin được ghi rõ là **chờ quyết định**, không được
coi là yêu cầu đã duyệt.

## 2. Từ vựng và ranh giới trạng thái

- **Kênh nhận món (`orderType`)**: `DineIn`, `Pickup`, `Delivery`.
- **Thanh toán** trả lời tiền đã được xác nhận hay chưa.
- **Chuẩn bị món** dùng trạng thái đơn/món hiện có.
- **Giao nhận** sẽ là một vòng đời riêng; không dùng `Preparing`, `Ready`, `Completed` để biểu diễn
  tài xế đang nhận hay đang giao.
- Thông tin người nhận, địa chỉ và phí giao là **bản chụp trên đơn**. Việc khách sửa hồ sơ sau đó
  không được làm đổi chứng từ cũ.

## 3. Bất biến đã chốt

1. `DineIn` bắt buộc bàn, QR và phiên bàn hợp lệ như hiện tại.
2. `Pickup` bắt buộc tên và số điện thoại người nhận; không thuộc phiên bàn.
3. `Delivery` bắt buộc tên, số điện thoại và địa chỉ; không thuộc phiên bàn.
4. Phí giao do máy chủ xác định và đóng băng trong tổng tiền; không tin giá trị do client gửi.
5. `Pickup` và `Delivery` chưa thanh toán không được chuyển đơn hoặc món sang `Preparing`.
6. Luồng `DineIn` cũ vẫn giữ quy tắc thanh toán theo hóa đơn phiên bàn.
7. Migration kỳ này chỉ mở rộng. Không xóa hay đổi nghĩa cột cũ; có thể tắt nhận đơn ngoài quán
   và quay lại binary cũ trong khi giữ nguyên schema mới.

## 4. Lát cắt triển khai hiện tại

- Backend hiểu ba loại đơn và lưu snapshot giao nhận.
- API tạo đơn giữ nguyên endpoint để tương thích; trường mới là nullable/additive.
- Tổng đơn ngoài quán bằng tiền món sau giảm giá cộng phí giao.
- Chặn paid-before-preparation ở cả thao tác đổi trạng thái toàn đơn và từng món.
- Contract TypeScript được mở rộng, nhưng màn checkout giao hàng chưa bật trong lát cắt này.

## 5. Backlog bắt buộc trước khi bán thật

### P0 — cấu hình món

Thiết kế nhóm lựa chọn và snapshot giá cho size, topping, mức đường, mức đá, khẩu phần và ghi chú.
Mỗi nhóm phải khai số lựa chọn tối thiểu/tối đa; máy chủ kiểm tra availability và tự tính phụ thu.

### P0 — báo giá giao hàng

Chốt vùng phục vụ, bán kính, đơn tối thiểu, cách tính phí, giờ nhận đơn và thời gian dự kiến. API
báo giá phải trả về mã báo giá có hạn dùng; API tạo đơn không tin phí do client tự gửi.

### P0 — thanh toán và phát hành cho bếp

Trong giai đoạn đầu, `Delivery` chỉ dùng VietQR trả trước. Khi webhook hoặc quầy xác nhận tiền,
đơn được phát hành vào hàng chuẩn bị đúng một lần. Đơn chưa trả không xuất hiện trên bảng bếp.

### P1 — vòng đời giao nhận

Thêm fulfillment riêng: chờ bàn giao, đã nhận, đang giao, đã giao, giao thất bại; lưu người thao
tác và thời điểm. Quy định rõ huỷ/hoàn tiền trước và sau khi bếp bắt đầu.

### P1 — ứng dụng và vận hành

Thêm checkout địa chỉ, màn chờ thanh toán/khôi phục đơn, theo dõi giao hàng và hàng điều phối cho
nhân viên. Không đưa địa chỉ hoặc số điện thoại vào topic realtime công khai hay log.

### P1 — kho và menu mới

Gán món vào bếp/quầy pha chế/khu lấy sẵn bằng cấu hình, không suy luận từ mã danh mục hard-code.
Thêm trạng thái hết nguyên liệu/tạm ngừng nhận giao hàng.

## 6. Quyết định còn chờ chủ quán

- Ai giao hàng: nhân viên quán hay đối tác; có cần gán tài xế không?
- Bán kính/vùng giao, phí theo khoảng cách hay theo vùng, đơn tối thiểu.
- Có nhận COD hay chỉ VietQR; nếu COD thì quy tắc “trả trước khi chuẩn bị” thay đổi thế nào?
- Chính sách huỷ, hoàn tiền, giao thất bại và khách không nhận hàng.
- Danh sách size/topping/đường/đá theo từng nhóm món và quy tắc hết topping.
- Có đặt lịch giao, nhiều chi nhánh, VAT/phí dịch vụ hay không.

## 7. Triển khai và quay lui

1. Chạy migration mở rộng; kiểm tra cột mới nullable và đơn cũ không đổi.
2. Deploy backend hiểu cả đơn cũ và mới, nhưng chưa bật UI giao hàng.
3. Chạy hồi quy `DineIn`; tạo thử `Pickup`/`Delivery` ở staging và chứng minh cổng thanh toán.
4. Chỉ bật intake sau khi checkout, bảng bếp và vận hành giao nhận đã sẵn sàng.
5. Khi cần quay lui: tắt intake, xử lý hết đơn ngoài quán đang mở, deploy binary cũ; giữ schema
   additive. Không tự động contract/drop trong kỳ chuyển tiếp.

## 8. Tiêu chí nghiệm thu nền tảng

- Tạo `Delivery` không cần QR/bàn nhưng thiếu một trường người nhận/địa chỉ phải bị từ chối.
- Cùng idempotency key và payload trả lại cùng đơn; payload khác trả conflict.
- Đơn ngoài quán chưa thanh toán bị chặn ở cả order-level và item-level preparation.
- Sau xác nhận thanh toán, đơn được phép đi vào chuẩn bị.
- Đơn `DineIn` và toàn bộ test hiện có không đổi hành vi.
- API response trả đúng `orderType`, thông tin giao nhận và phí/tổng tiền đã đóng băng.
