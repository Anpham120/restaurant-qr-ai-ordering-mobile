# Kế hoạch học kỳ 2026-2 — fork cá nhân CMC Restaurant

**Chủ fork:** Phạm Duy An (BIT240002) · **Repo:** `Anpham120/restaurant-qr-ordering-mobile` (public)
**Lập:** 2026-08-17 · **Viết lại:** 2026-09-05 sau khi chốt lại phạm vi

---

## 1. Phạm vi đã chốt

Kỳ này **không thêm bề rộng**. Làm sâu đúng hai mảng:

1. **Hạ tầng triển khai** — CI/CD, hai môi trường tách biệt, kiểm sức khoẻ, quay lui, quan trắc.
2. **Nghiệp vụ đặt món** — trải nghiệm của khách và của bếp từ lúc quét QR tới lúc trả tiền.

### Đã bỏ khỏi phạm vi, và vì sao

**Trợ lý tư vấn thực đơn.** Không ai trong nhóm chuyên về mảng này, và kỳ này cũng không có học
phần tương ứng. Giữ lại nghĩa là bảo trì một phần hệ thống mà chủ dự án không giải thích được khi
bị hỏi — rủi ro lớn hơn giá trị nó mang lại. Đã gỡ khỏi backend, web, app, hạ tầng, CI, tài liệu
và cơ sở dữ liệu (migration **V28**).

Đổi lại, thời gian đó dồn cho quan trắc và cho chất lượng luồng đặt món — hai thứ đo được và giải
thích được.

---

## 2. Hiện trạng — đếm từ mã, không phải nhớ lại

Số liệu dưới đây sinh ra từ mã và có cổng CI đối chiếu
([`ARCHITECTURE.md`](../backend/ARCHITECTURE.md), [`API_CONTRACT.md`](../backend/API_CONTRACT.md)):

| Chỉ số | Giá trị |
|---|---|
| Module backend | 12 |
| Endpoint | 88 |
| Migration Flyway | 28 |
| Ứng dụng web triển khai thật | 3 (+2 stub chuyển hướng) |
| Gói dùng chung frontend | 7 |
| Bất biến đặc tả (`SPEC.md` §V) | 43 |
| Workflow CI/CD | 7 |
| Cổng `--check` trong CI | 6 |

> Trước lượt viết lại này, chính bảng trên ghi **17 module / 84 endpoint / 21 migration** — cả ba
> con số đều sai. Đó là lý do bốn cổng `--check` tồn tại: số nào kể lại trạng thái mã mà không
> sinh ra từ mã thì sẽ trôi.

---

## 3. Đã xong

| Mảng | Việc |
|---|---|
| Backend | Chuyển toàn bộ sang Java 21 / Spring Boot; bản .NET đã xoá |
| Realtime | SignalR → STOMP over WebSocket, kèm một phép kiểm đầu-cuối chạy trong CI |
| Triển khai | Hai môi trường thật trên một máy chủ, tách project/cổng/nginx; CD bấm tay có người duyệt |
| Thanh toán | VietQR + đối soát tự động qua webhook SePay |
| Đặt món | Trạng thái theo từng món; ước lượng thời gian theo từng bếp (bếp nấu / quầy pha chế / lấy sẵn) |
| Bếp | Bảng bếp 4 cột; nhập số phút trễ do bếp tự khai |
| Quầy | Ca quầy: mở ca, thu chi, chốt ca; đổi điểm phải quầy xác nhận |
| Di động | App khách hàng thân thiết bằng **Expo / React Native** (không phải Flutter như bản kế hoạch đầu); khách tự tạo tài khoản và tự gắn số điện thoại |
| Tài liệu | Kiểm kê endpoint, bảng module và chỉ mục tài liệu đều sinh từ mã và có cổng CI |

---

## 4. Còn lại

Xếp theo thứ tự tôi định làm, không phải theo mức độ dễ.

### 4.1 Quan trắc — mảng còn yếu nhất

Hiện chỉ có kiểm sức khoẻ sau triển khai. Nghĩa là hệ thống chỉ tự nói được "còn sống", không nói
được "đang chậm ở đâu".

- Log tập trung cho cả hai môi trường, đọc được mà không phải SSH vào máy.
- Số đo thời gian phục vụ **thật** — từ lúc gửi đơn tới lúc món ra bàn — để đối chiếu với con số
  ước lượng mà hệ thống đang hiển thị cho khách. Đây là phép kiểm trung thực nhất cho mục 4.3.
- Cảnh báo khi API đỏ hoặc cơ sở dữ liệu hết chỗ.

### 4.2 Sao lưu có kiểm chứng

Script sao lưu và khôi phục đã có, **nhưng chưa từng khôi phục thử**. Một bản sao lưu chưa khôi
phục là một giả định. Việc cần làm: khôi phục bản sao lưu của production sang một cơ sở dữ liệu
tạm, so số bản ghi, rồi ghi lại quy trình.

### 4.3 Đo lại chất lượng ước lượng thời gian lên món

Hai con số `KITCHEN_PARALLEL_DISHES=6` và `KITCHEN_PARALLEL_BAR_ITEMS=2` hiện là **giá trị đặt ra,
chưa phải giá trị đo**. Có số đo thật từ mục 4.1 rồi thì chỉnh lại theo dữ liệu.

### 4.4 Mở rộng kiểm hồi quy

`realtime-e2e` mới phủ đường realtime. Chưa có phép kiểm đầu-cuối cho hành trình nhiều thiết bị:
hai điện thoại cùng bàn, một máy quầy, một màn bếp, cùng lúc.

### 4.5 Khả năng tiếp cận và hiệu năng

Chưa có ngân sách hiệu năng và chưa có phép kiểm a11y nào chạy tự động.

---

## 5. Quy trình

- Mọi thay đổi đi qua issue → nhánh từ `develop` → pull request → CI xanh → merge.
- `develop` có ruleset: bắt buộc PR, bắt buộc `backend-java-build` xanh, chặn force-push.
- Triển khai **không** tự chạy theo push. Chạy workflow `cd` bằng tay, chọn môi trường, và phải
  có người duyệt.
- Bí mật chỉ nằm trong GitHub Environments, không bao giờ trong kho mã.

Chi tiết: [`GIT_AND_TEAM.md`](../devops/GIT_AND_TEAM.md) và
[`PIPELINE_AND_DEPLOY.md`](../devops/PIPELINE_AND_DEPLOY.md).

---

## 6. Rủi ro đang mở

| Rủi ro | Vì sao đáng lo | Đang làm gì |
|---|---|---|
| Khôi phục cơ sở dữ liệu chưa thử | Mất dữ liệu thật thì mới biết script hỏng | Mục 4.2 |
| Quay lui mã không quay lui lược đồ | Một migration đã chạy thì vẫn ở đó | Mỗi thay đổi lược đồ phải nghĩ đường lùi trước |
| Ước lượng thời gian dựa trên hai hằng số chưa đo | Khách thấy con số sai thì mất tin vào cả hệ thống | Mục 4.1 → 4.3 |
| Một máy chủ chạy cả hai môi trường | Máy chết là mất cả hai | Chấp nhận trong phạm vi học phần; đã tách project/cổng để lỗi cấu hình không lan |
