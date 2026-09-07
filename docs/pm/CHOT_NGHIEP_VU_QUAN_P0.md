# Chốt nghiệp vụ quán — P0 ăn tại quán

**Lập:** 06/09/2026 · **Trạng thái:** chờ chủ kho duyệt §7

Tài liệu này **hoàn thiện** bản *Kiến trúc hệ thống và database chi tiết v1.0* bằng cách đối chiếu
nó với **mã thật trên nhánh đang làm**, áp phạm vi mới nhất, và giải quyết các va chạm.

> **Vì sao cần bước này.** Bản kiến trúc đối chiếu commit `d9afcada` (= `main`, Flyway **V1–V23**).
> Nhánh `feat/chuyen-doi-quan-may` đang ở **V1–V31** và có toàn bộ mã `Shop*`. Tài liệu phân tích
> một bản mã **cũ hơn hai đợt việc**, nên vài kết luận của nó đã lệch. Chính tài liệu đã lường
> trước: *"phải kiểm Flyway history/nhánh mới trước lấy số chính thức"* và *"Repository schema chỉ
> là nguồn thiết kế, database thật có thể drift."*

---

## 1. Phạm vi đã chốt

| Có trong P0 | Không có trong P0 |
|---|---|
| Khách **đang ở quán**: quét QR tại bàn, đặt, trả trước, theo dõi đơn của mình | Đặt mang về trước qua app |
| Khách **đến quầy** mua mang về: nhân viên nhập món, thu trước, cấp mã nhận | Giao tận nhà |
| App di động cho **khách hàng**: tài khoản, điểm, voucher, lịch sử, quét QR | Actor người giao, app tài xế |
| Web cho **quầy** và **quản lý** | Địa chỉ, phí ship, bản đồ |

Ba vai: **Khách hàng**, **Nhân viên quầy**, **Quản lý**. Không có vai bếp — người pha chế chính là
người ở quầy. `Kitchen` và `Staff` là dữ liệu cũ, chỉ ánh xạ có duyệt, không cấp mới.

**Mục tiêu phục vụ 15 phút:** DineIn tính tới lúc phục vụ đủ; Takeaway tính tới lúc đóng gói xong.
Quá hạn **không** tự bồi hoàn.

---

## 2. Bốn va chạm với mã thật — và cách xử

### 2.1 Số migration V24–V31 **đã bị chiếm**

Tài liệu đề xuất V24–V33. Trên nhánh này đã có:

```
V24 adds_cash_tendered          V28 drops_chat_tables
V25 adds_counter_redeemed_by    V29 adds_order_fulfillment_details
V26 drops_loyalty_link_codes    V30 shop_catalog_and_delivery
V27 prep_minutes_for_non_kitchen_items   V31 correct_shop_product_art
```

Trùng số là **Flyway đỏ ngay lúc khởi động** — không phải lỗi chạy được rồi mới biết.

> **Xử:** dời toàn bộ kế hoạch sang **V32–V41**, giữ nguyên thứ tự và nội dung từng đợt. Không sửa
> V1–V31 đã có.

### 2.2 `loyalty_link_codes` **đã bị xoá**, tài liệu tưởng còn

§5.46 viết *"loyalty_link_codes: giữ làm mã nối một lần, thêm verify workflow"*. Nhưng **V26 đã
`DROP TABLE`** nó, vì nghiệp vụ đổi sang *khách tự nối số bằng OTP*, và mã nối chỉ chứng minh khách
đang giữ app — không chứng minh sở hữu SIM. Tài liệu cũng nhận ra điểm yếu đó ở §5.2.

> **Xử:** bỏ mục đó khỏi kế hoạch. `customer_member_links` (§5.2) vẫn tạo, với
> `verified_method = PHONE_PROVIDER` (OTP, đường chính) hoặc `COUNTER_REVIEW` (quầy đối chiếu).
> Không hồi sinh bảng mã nối.

### 2.3 Bảng `chat_*` và `knowledge_entries` **đã bị xoá**

§5.46 viết *"chat_*, knowledge_entries, menu_item_knowledge: giữ ngoài P0"*. **V28 đã xoá** cả bốn
bảng chat khi gỡ trợ lý AI khỏi hệ thống.

> **Xử:** bỏ khỏi tài liệu. §11 "AI tư vấn có thể tái dùng sau" vẫn đúng như một hướng tương lai,
> nhưng phải xây lại từ đầu, không phải "tái dùng bảng còn đó".

### 2.4 Một nhận xét của tài liệu **đã được sửa rồi**

§3 chê *"Tải hiện tại SUM prep theo dòng chưa đủ cho quantity/trạm"*. Trên nhánh này truy vấn đã là
`sum(m.prep_minutes * oi.quantity)` — chỉ `main` là còn lỗi.

> **Xử:** không cần làm lại. Nhưng phần còn lại của nhận xét vẫn đúng: **hàng chờ chỉ tính đơn đã
> trả tiền**, và ước lượng cũ **không được dùng làm SLA**.

---

## 3. Ngã ba lớn: hai thiết kế cho cùng một bài toán

Nhánh hiện tại đã có mã `Shop*` do một đợt làm trước, giải quyết **cùng những vấn đề** nhưng theo
cách khác hẳn:

| Vấn đề | Mã `Shop*` đang có | Tài liệu kiến trúc |
|---|---|---|
| Tuỳ chọn món | `MenuOptionsConverter` → **jsonb** trên `menu_items` | 4 bảng quan hệ: `menu_variants`, `modifier_groups`, `modifier_options`, bảng nối |
| Giỏ hàng | **giữ** `table_session_cart_items` | `carts` + `cart_items` + `cart_item_options` |
| Kiểu đơn | `Pickup` / `Delivery` | `Takeaway` (không có Delivery) |
| Báo giá | tính lúc tạo đơn | `checkout_quotes` có hạn dùng, consume đúng một lần |
| Trạng thái món | trạng thái đơn lẻ mỗi dòng | 5 bucket + `fulfillment_events` + `ready_batches` |

### Bằng chứng chốt lựa chọn

`V1__baseline_schema.sql` dòng 1043:

```sql
CREATE UNIQUE INDEX "IX_table_session_cart_items_table_session_id_menu_item_id"
ON public.table_session_cart_items (table_session_id, menu_item_id);
```

**Một dòng giỏ cho mỗi (phiên, món).** Giỏ hiện tại **không thể chứa hai ly cùng loại khác mức
đường** — hình dạng đơn phổ biến nhất của một quán nước. Đây không phải điểm trừ, mà là **chặn
đứng**, và tài liệu chỉ đúng chỗ này: `configuration_hash` + `UNIQUE(cart_id, configuration_hash)`
là cách đúng.

> **Khuyến nghị: theo thiết kế tài liệu.** Mã `Shop*` giữ làm bản thử để lấy lại phần dùng được —
> ảnh SVG danh mục, bố cục màn hình, luồng checkout — **không dùng làm nền dữ liệu**.

### Tên kiểu đơn

Tài liệu dùng `Takeaway`; mã dùng `Pickup`. Đổi bây giờ rẻ vì **chưa có dữ liệu `Pickup` nào ngoài
máy cá nhân**; sau này có đơn thật thì đắt.

> **Khuyến nghị: `Takeaway`.** `Pickup` gợi ý *đặt trước rồi tới lấy* — đúng thứ vừa bị loại khỏi
> phạm vi, nên giữ tên đó là mời hiểu nhầm.

---

## 4. Ba lỗ hổng trong chính bản thiết kế

### 4.1 Khách đăng nhập app nhưng đơn vẫn là đơn khách vãng lai

§1 nói app quét QR thì **mở luồng web tại bàn**, và *"đơn guest mặc định theo dõi bằng web"*, lịch
sử cá nhân chỉ có khi đơn đã gắn chủ bằng bằng chứng hợp lệ.

Hệ quả: **khách đã đăng nhập app, quét QR, đặt món — đơn đó không xuất hiện trong lịch sử app.** Họ
sẽ báo là lỗi, và họ đúng.

> **Giải pháp:** khi app mở luồng web, truyền luôn token của khách để `orders.owner_user_id` được
> đặt **ngay lúc tạo đơn**. `guest_sessions` chỉ dành cho người quét bằng trình duyệt thường.
> Không phải gắn chủ sau tại quầy — đó là đường sửa sai, không phải đường chính.

### 4.2 Không có đường trả lại đơn đã nhận làm

§7.2 cho nhân viên `claim` một đơn, và §5.22 có `order_assignments` để bàn giao. Nhưng §8 **không
liệt kê endpoint nào** để đổi người phụ trách hay trả đơn về hàng chờ.

Tình huống thật: nhân viên nhận đơn rồi phải rời quầy. Đơn kẹt ở `Preparing`, không ai nhận được,
và đồng hồ 15 phút vẫn chạy.

> **Giải pháp:** thêm `POST /api/v2/orders/{id}/reassign` (đổi người) và `POST /.../release` (trả về
> `Queued`, giữ nguyên `queue_sequence` để không mất chỗ). Cả hai ghi `order_assignments` và yêu
> cầu lý do.

### 4.3 `queue_control` khoá một dòng cho **mọi** lần vào hàng

§7.1 bắt lấy `queue_control FOR UPDATE` **trước** order/payment ở mọi luồng enqueue — kể cả trong
webhook ngân hàng, và §7.2 cũng lấy nó ở mọi lần `claim`. Nghĩa là mọi xác nhận thanh toán và mọi
lần nhận việc của cả quán **xếp hàng qua một dòng**, trong khi webhook còn giữ khoá đó lúc làm việc
tồn/voucher.

Ở quy mô một quán thì chấp nhận được — nhưng phải biết mình đang chấp nhận gì.

> **Giải pháp:** giữ thiết kế, thêm ba thứ:
> 1. **Ngân sách thời gian** cho phần giữ khoá; vượt thì log cảnh báo, vì đây là chỗ sẽ nghẽn đầu
>    tiên khi đông.
> 2. **Một phép kiểm cho cái bẫy mà chính tài liệu nêu**: job hết hạn hold **không được** lấy
>    `queue_control` sau khi đã khoá order. Đó là deadlock chỉ hiện ra lúc đông khách — loại lỗi tệ
>    nhất để phát hiện bằng cách gặp nó.
> 3. Không dùng `SKIP LOCKED` để lách, đúng như tài liệu nói, vì nó phá FIFO.

---

## 5. Vấn đề lớn nhất: P0 vẫn quá lớn

Đếm từ §5 của bản kiến trúc: **38 bảng mới**, 10 đợt migration. Đó là P0 của một sản phẩm thương
mại có đội ngũ, không phải của một người trong một học kỳ.

Bạn đã nói *"chỉ tập trung ăn tại quán trước rồi phát triển sau"*. Vậy nên cắt tiếp — và cắt theo
**thứ nào chặn thứ nào**, không theo thứ nào dễ.

| Giai đoạn | Bảng mới | Xong thì làm được gì |
|---|---|---|
| **1 — Đặt đúng món** | `guest_sessions`, `carts`, `cart_items`, `cart_item_options`, `menu_variants`, `modifier_groups`, `modifier_options`, `menu_item_modifier_groups` | Khách quét QR, chọn size/đường/đá; hai ly khác nhau ra hai dòng. **Đây là thứ giỏ cũ không làm được.** |
| **2 — Thu tiền đúng** | `checkout_quotes`, `payment_attempts`, `bank_webhook_events`, mở rộng `orders`/`payments` | Chốt giá, VietQR, đối soát, vào hàng chờ. **Hết giai đoạn 2 là bán được hàng.** |
| **3 — Phục vụ đúng** | buckets trên `order_items`, `fulfillment_events`, `ready_batches`, `serving_allocations`, `order_service_targets`, `queue_control`, `preparation_stations` | Ra từng đợt, FIFO, đồng hồ 15 phút. **Hết giai đoạn 3 là phục vụ tử tế.** |
| **4 — Sai thì sửa được** | `service_incidents`, `remake_tasks`, `order_adjustments`, `refund_requests`, `refund_lines`, `refund_payouts`, `order_discounts` | Hết món, làm lại, hoàn tiền. **Hết giai đoạn 4 mới dám mở cửa thật.** |
| **5 — Về sau** | `stock_*`, `notifications`, `device_tokens`, `attachments`, `audit_logs`, `command_requests`, `outbox_events`, `intake_controls`, `customer_member_links`, `shop_settings` | Tồn kho, push, chứng từ, nhật ký |

Vài lưu ý về thứ tự này:

- **`shop_settings` và `command_requests` bị đẩy xuống 5** nhưng có phần phải làm sớm: hằng số
  15 phút và khoá idempotency. Giai đoạn 1–2 dùng hằng số trong mã, và `orders.idempotency_key`
  đã có sẵn từ V1 — đủ dùng, chưa cần bảng riêng.
- **`stock_*` xuống 5 là quyết định có rủi ro**: không quản tồn thì bán được món vừa hết. Nhưng
  quán nhỏ biết mình còn gì, và `menu_items.is_available` đã có. Chấp nhận, và ghi vào sổ rủi ro.
- **`outbox_events` xuống 5** nghĩa là giai đoạn 1–4 phát realtime trực tiếp sau commit, chấp nhận
  mất thông báo nếu tiến trình chết đúng lúc đó. Đây là đánh đổi có ý thức, không phải bỏ quên.

---

## 6. Những gì tài liệu làm đúng, giữ nguyên không bàn lại

Ghi ra để không ai "cải tiến" lại thành sai:

- **Thu đủ tiền mới được làm.** `Paid` **không** tự suy ra `Completed`, không tự cộng điểm, không
  tự đóng bàn.
- **Tích điểm khi hoàn tất, không khi thu tiền.** Mã hiện tại cộng điểm lúc xác nhận thanh toán —
  phải bỏ ở v2.
- **`received_amount` và `refunded_amount` tính từ giao dịch thật**, không suy từ `status`. Trạng
  thái `Refunded` cũ có thể chỉ là một lần bấm nút, không phải tiền đã ra khỏi tài khoản.
- **Chuyển khoản thủ công không bảo đảm exactly-once bằng cơ sở dữ liệu.** Chưa rõ đã trả chưa thì
  `NeedsReview`, **không tự thử lại**.
- **At-least-once cho outbox**, không hứa exactly-once cho push.
- **Không auto-merge số điện thoại 0/+84 trùng.** Xuất báo cáo, người đối chiếu, rồi mới gộp.
- **Không giả `paid_at`/`full_served_at` cho đơn cũ** để bảng biểu đẹp. Thiếu dữ kiện thì
  `legacy_review_required`.
- **Guest không được subscribe topic của cả bàn.** Biết token phiên không phải quyền đọc đơn người
  khác.

---

## 7. Chờ duyệt

| # | Quyết định | Khuyến nghị |
|---|---|---|
| **A** | Theo thiết kế tài liệu, hay giữ nền `Shop*` rồi vá? | **Theo tài liệu.** Giỏ cũ không chứa nổi hai ly khác đường — đó là chặn đứng, không phải điểm trừ |
| **B** | `Takeaway` hay `Pickup`? | **`Takeaway`.** Đổi bây giờ chưa có dữ liệu thật, sau này đắt |
| **C** | Cắt 5 giai đoạn ở §5? | **Có.** Hết giai đoạn 2 là bán được hàng; hết 4 mới dám mở cửa |
| **D** | Dời migration sang V32–V41? | **Bắt buộc** — không phải lựa chọn, V24–V31 đã bị chiếm |
| **E** | Ba lỗ hổng §4 (chủ đơn từ app, trả đơn về hàng chờ, ngân sách khoá) | **Làm cả ba**, đều rẻ nếu làm ngay từ đầu |

Chưa đụng một dòng mã nào. Duyệt xong tôi bắt đầu từ giai đoạn 1.
