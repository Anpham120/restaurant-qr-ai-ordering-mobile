# Thiết kế ba vai vận hành — nghiệp vụ và trải nghiệm

> **Lập: 2026-09-05.** Đây là tài liệu **thiết kế**, không phải mô tả hiện trạng. Hiện trạng nằm ở
> [`PHAN_TICH_NGHIEP_VU.md`](PHAN_TICH_NGHIEP_VU.md). Chỗ nào là hiện trạng đều ghi rõ "đang".
>
> Phần UX rút từ **bối cảnh vận hành thật** của từng vai, cộng bộ quy tắc ưu tiên chung (tiếp cận
> được → chạm được → hiệu năng → bố cục). Không tra từ một cơ sở dữ liệu mẫu thiết kế nào.

---

## 1. Ba vai, và ranh giới giữa chúng

Hệ thống vận hành có **đúng ba vai**: `Admin` (quản lý), `CounterStaff` (nhân viên quầy),
`Kitchen` (nhân viên bếp). Vai `Customer` thuộc phía khách, không phải vai vận hành.

### Nguyên tắc phân vai

**Người gần việc nhất là người có quyền.** Không phải người cấp cao nhất.

Người mở tủ lạnh mới biết hết cá, nên bếp tự tắt món — không phải chờ quản lý. Người đếm ngăn kéo
mới biết thiếu tiền, nên quầy chốt ca — không phải quản lý. Quản lý đặt luật và đọc kết quả.

### Ai sở hữu cái gì

| | Quản lý | Quầy | Bếp |
|---|---|---|---|
| **Câu hỏi họ trả lời** | "Quán chạy thế nào, và luật là gì?" | "Bàn nào cần gì bây giờ?" | "Nấu gì tiếp?" |
| **Nhịp làm việc** | vài lần một ngày, phiên dài | liên tục, bị cắt ngang | liên tục, liếc 1–2 giây |
| Thực đơn, giá, thời gian lên món | **sở hữu** | — | tắt/bật còn hàng |
| Bàn, mã QR | **sở hữu** | xem sơ đồ | — |
| Khuyến mãi, ưu đãi, hạng | **sở hữu** | áp dụng, xác nhận đã giao | — |
| Tài khoản và vai | **sở hữu** | — | — |
| Ca quầy và tiền mặt | **giám sát** | **sở hữu** | — |
| Thu tiền, chốt hoá đơn | — | **sở hữu** | — |
| Điều phối gọi nhân viên | — | **sở hữu** | — |
| Trạng thái từng món | — | — | **sở hữu** |
| Độ trễ bếp | — | — | **sở hữu** |
| Báo cáo | **sở hữu** | xem ca của mình | — |

### Cố ý KHÔNG cho làm — và vì sao

Phần này quan trọng hơn bảng trên. Một vai được định nghĩa bằng thứ nó **không** làm.

| Vai | Không được | Vì sao |
|---|---|---|
| **Quản lý** | Mở ca, chốt ca, thu tiền | Người chịu trách nhiệm về con số lệch quỹ không được là người tạo ra nó. Đây là tách quyền, không phải thiếu tính năng |
| **Quản lý** | Đổi trạng thái món ở bảng bếp | Chỉ người đứng bếp biết món đã ra chưa. Quản lý bấm hộ là ghi một sự kiện chưa xảy ra |
| **Quầy** | Sửa giá, sửa thời gian lên món | Giá là luật của quán, không phải quyết định lúc thu tiền |
| **Quầy** | Đẩy trạng thái món | Cùng lý do với quản lý |
| **Bếp** | Đổi trạng thái ĐƠN, trừ `Ready → Served` | Bếp biết món xong, không biết bàn đã trả tiền chưa |
| **Bếp** | Xem tiền, xem hoá đơn | Không cần cho việc của họ, và ít quyền hơn thì ít rủi ro hơn |

### Việc phải làm: bỏ vai `Staff`

Vai `Staff` hiện là vai thứ tư, **đang chết dở**: không tạo mới được (`AdminUserService` chỉ nhận
`Admin`/`CounterStaff`/`Kitchen`) nhưng quyền vẫn rải khắp backend, và frontend cấp cho nó bộ tab
của quầy — gồm cả tab "Ca làm việc" mà máy chủ từ chối. Tài khoản `Staff` mở tab đó nhận 403 ở mọi
thao tác.

Quy mô dọn: **12 chỗ ở backend** (10 tệp), **2 chỗ ở frontend**, không có tài khoản `Staff` nào
trong dữ liệu mẫu. Cần một migration đổi tài khoản `Staff` đang tồn tại sang `CounterStaff` —
không xoá tài khoản, vì người đó vẫn đang đi làm.

---

## 2. Bối cảnh vận hành quyết định giao diện

Đây là phần cốt lõi của tài liệu. Ba vai không khác nhau ở "màu sắc thương hiệu" mà khác nhau ở
**điều kiện vật lý lúc họ chạm vào màn hình**.

| Trục | Bếp | Quầy | Quản lý |
|---|---|---|---|
| **Khoảng cách nhìn** | 1,5–2 m, màn treo | 40–60 cm | 40–60 cm |
| **Tay** | dính dầu, ướt, có thể đeo găng | một tay bận (tiền, máy POS) | rảnh, có chuột |
| **Sự tập trung** | ở cái chảo — liếc 1–2 giây | bị cắt ngang liên tục | liên tục, phiên dài |
| **Giá của một lần bấm nhầm** | món không bao giờ ra bàn | sai tiền, có sổ sách | sai giá cho **mọi** đơn về sau |
| **Môi trường** | hơi nước, nóng, chói, ồn | ồn, có khách đang nhìn | yên |

Năm trục này quyết định gần như mọi lựa chọn giao diện bên dưới. Điều đáng nói: **hiện tại cả ba
màn dùng chung một thang chữ** — bảng bếp đang đặt nhãn `12px` và đệm `12px`, đúng thang của bảng
quản trị trên laptop.

---

## 3. Bếp — nghiệp vụ và trải nghiệm

### 3.1 Nghiệp vụ

| Việc | Chi tiết |
|---|---|
| Nhìn hàng đợi | Bốn cột: `Đơn mới → Đang nấu → Chờ ra món → Đã ra món` |
| Đẩy từng món | Một chạm đẩy đúng một bước. Không kéo thả |
| Báo hết món | Tắt còn hàng ngay tại bếp; thực đơn khách đổi lập tức |
| Khai độ trễ | Nhập số phút cộng thêm (tối đa 60), chỉ áp cho món của bếp |
| Thấy mức gấp | Chờ ≥12 phút cảnh báo, ≥20 phút gấp |

### 3.2 Nguyên tắc trải nghiệm

**a. Đọc được từ 2 mét, không phải từ 40 phân.**

Chữ nhìn từ 2m cần lớn gấp khoảng 3–4 lần chữ nhìn từ 50cm để cùng một góc nhìn. Thang đề xuất cho
riêng bảng bếp:

| Thành phần | Đang là | Đề xuất |
|---|---|---|
| Tên món | ~14px | **28–32px**, đậm |
| Số lượng | ~14px | **32px**, là thứ to nhất trên thẻ |
| Mã bàn | ~14px | **24px** |
| Nhãn phụ (thời gian chờ) | 12px | **18px** |
| Chữ trang trí | 12px | **bỏ hẳn** |

Nguyên tắc thay cho bảng số: **nếu đứng cách màn 2m mà phải nheo mắt, nó chưa xong.** Đây là phép
thử làm được ngay tại bếp, không cần công cụ.

**b. Chạm được bằng khớp ngón tay và mu bàn tay.**

Tiêu chuẩn 44×44px là cho ngón tay trần chạm điện thoại cầm trên tay. Bếp không có điều kiện đó:
tay dính dầu, có thể đeo găng, và người ta hay chạm bằng khớp ngón hoặc mu bàn tay để khỏi bôi bẩn
màn hình.

- Nút đẩy trạng thái: **tối thiểu 72px cao**, rộng hết chiều rộng thẻ.
- Khoảng cách giữa hai vùng chạm: **tối thiểu 16px**, để chạm hụt không rơi vào nút bên cạnh.
- **Không** có thao tác cần chính xác: không kéo thả, không nhấn giữ, không menu ngữ cảnh, không
  vuốt để xoá.

**c. Màu không bao giờ là tín hiệu duy nhất.**

Hơi nước, ánh chói, và người mù màu — cả ba đều làm màu mất tác dụng. Mức gấp phải mã hoá bằng
**ba** thứ cùng lúc: màu, **vị trí** (thẻ gấp lên đầu cột), và **chữ** ("chờ 22 phút").

**d. Bảng không được nhảy dưới ngón tay.**

Đơn mới vào phải chèn ở **cuối cột**, không chen lên đầu và đẩy mọi thứ xuống. Một thẻ dịch chỗ
đúng lúc ngón tay đang hạ xuống là một lần bấm nhầm — và ở đây bấm nhầm nghĩa là món không ra bàn.

Ngoại lệ duy nhất: thẻ chuyển sang mức **gấp** thì được lên đầu, vì đó chính là thông tin cần
truyền. Nhưng phải có chuyển động thấy được (~200ms) chứ không nhảy tức thì, để mắt bám theo.

**e. Không hỏi lại, nhưng hoàn tác được.**

Hộp thoại xác nhận tốn một giây và một lần chạm nữa, ở đúng lúc tay bận nhất. Thay bằng: hành động
xảy ra ngay, và có **nút hoàn tác trong 5 giây** ngay tại thẻ đó.

Ngoại lệ: **huỷ món** vẫn hỏi lại, vì nó không hoàn tác được về phía khách.

**f. Âm thanh là phụ, không phải chính.**

Bếp ồn. Chuông báo đơn mới có thì tốt, nhưng mọi thông tin phải đọc được bằng mắt mà không cần
nghe.

### 3.3 Chỗ hiện tại đang sai

| Vấn đề | Hệ quả |
|---|---|
| Thang chữ 12–14px | Không đọc được ở khoảng cách làm việc thật |
| Đệm 12px, khoảng cách 10px | Vùng chạm nhỏ và sát nhau |
| Bốn cột trên cùng một hàng ở màn rộng | Mỗi cột hẹp lại, chữ càng nhỏ. Bếp thường chỉ cần **hai** cột đầu |
| Ô nhập độ trễ dùng bàn phím | Tay bẩn gõ số. Nên có sẵn vài mức nhanh **cộng với** ô nhập |

> Về ô nhập độ trễ: bản trước là các nút mức đặt sẵn, đã đổi thành ô nhập theo yêu cầu vì các mức
> cứng không khớp thực tế. Thiết kế đúng là **cả hai**: ô nhập là đường chính, thêm 2–3 mức hay
> dùng làm đường tắt — không quay lại bỏ ô nhập.

---

## 4. Quầy — nghiệp vụ và trải nghiệm

### 4.1 Nghiệp vụ

| Việc | Chi tiết |
|---|---|
| Ca làm việc | Mở ca với tiền đầu ca → ghi thu chi → chốt ca, hiện lệch quỹ |
| Thu tiền | Hoá đơn bàn: tiền mặt hoặc VietQR; VietQR đối soát tự động qua webhook |
| Phiếu tặng món | Xác nhận khách đã nhận ưu đãi đổi điểm — điểm chỉ trừ tại đây |
| Điều phối | Nhận yêu cầu gọi nhân viên, bấm bộ đàm, đánh dấu đã điều phối |
| Tra cứu | Lịch sử hoá đơn đã chốt |

### 4.2 Nguyên tắc trải nghiệm

**a. Bị cắt ngang là trạng thái mặc định, không phải ngoại lệ.**

Đây là yêu cầu số một của màn quầy. Người ở quầy gần như không bao giờ làm xong một việc trong một
mạch: đang đếm tiền thì có bàn gọi, đang mở ca thì khách tới hỏi.

Hệ quả bắt buộc:

- **Không mất dữ liệu đang gõ khi đổi tab.** Số tiền khách đưa, ghi chú điều chỉnh — phải còn
  nguyên khi quay lại.
- **Không có hộp thoại chặn toàn màn hình** cho việc dài. Việc dài phải là một vùng trên trang, bỏ
  đi rồi quay lại được.
- Việc đang dở phải **thấy được từ tab khác** — một dấu hiệu trên tab, không phải im lặng.

**b. Việc phải làm thì không tự tắt.**

Đã áp cho dải điều phối và đúng: thông báo nổi tự tắt sau 5 giây thì đủ cho một tin báo, quá ngắn
cho một việc. Nguyên tắc này áp cho **mọi** thứ ở màn quầy, không riêng dải điều phối:

> Thông báo có thể tự tắt. Việc phải làm chỉ mất khi có người nói đã làm xong.

**c. Tiền hiện theo luật của tiền.**

- Số tiền dùng **chữ số đều bề ngang** (`font-variant-numeric: tabular-nums`), căn phải, để cột số
  thẳng hàng và so được bằng mắt.
- Số tiền phải trả: **to nhất trên màn**, tối thiểu 32px.
- Tiền thối tính và hiện **ngay khi gõ** số khách đưa, không chờ bấm nút.
- **Lệch quỹ giữ nguyên dấu** và có nhãn chữ: "thiếu 50.000đ" / "thừa 20.000đ", không phải
  "−50.000".

**d. Việc đụng tiền thì hỏi lại; việc khác thì không.**

Ngược với bếp. Ở bếp hoàn tác được nên không hỏi; ở quầy tiền đã ra khỏi ngăn kéo thì không hoàn
tác được, và có sổ sách.

Hỏi lại **chỉ** ở: chốt ca, xác nhận đã thu, hoàn tiền. Và hộp hỏi lại phải **nhắc lại con số**
("Chốt ca với lệch **thiếu 50.000đ**?"), không hỏi chung chung "Bạn có chắc không?".

**e. Một tay.**

Tay kia đang cầm tiền hoặc máy POS. Mọi việc thường xuyên phải làm được bằng một tay: không thao
tác cần hai điểm chạm, các nút chính nằm trong nửa dưới màn hình nếu là máy bảng.

**f. Có khách đang nhìn.**

Màn quầy đôi khi quay về phía khách. Không hiện thông tin của bàn khác, không hiện số điện thoại
đầy đủ của hội viên khác trên màn tra cứu.

### 4.3 Hiện trạng — hai mục c và d ĐÃ đạt

Kiểm lại mã trước khi kết luận, và kết quả khác với dự đoán ban đầu của tôi:

| Nguyên tắc | Hiện trạng |
|---|---|
| **c. Tiền hiện theo luật của tiền** | **Đã đạt.** `.counter-metric-value` dùng `font-variant-numeric: tabular-nums`, cỡ `clamp(20px, 3vw, 28px)`, đậm 800 |
| **d. Việc đụng tiền thì hỏi lại** | **Đã đạt, và đúng cách.** Chốt ca hỏi lại với nội dung *"Thực đếm 4.850.000đ. Thiếu 50.000đ so với hệ thống. Ca đã chốt thì không mở lại được."* — nêu đúng con số cần cân nhắc, tự tính chênh lệch thay vì bắt thu ngân đang mệt nhẩm, và bật cờ `danger` khi lệch khác 0 |

Còn lại đúng một mục chưa đạt:

| Vấn đề | Hệ quả |
|---|---|
| **a. Bị cắt ngang** — mất dữ liệu đang gõ khi đổi tab | `CounterHubPage` dựng tab theo điều kiện (`activeTab === "shift" ? <CounterShiftPanel/> : null`), nên đổi tab là **huỷ component** và `useState` mất theo. Người đang gõ số tiền khách đưa, có bàn gọi, bấm sang tab điều phối rồi quay lại — **số đã gõ biến mất**. Đúng tình huống mà nguyên tắc (a) sinh ra để chặn |

Cách sửa nhỏ hơn vẻ ngoài: dựng cả các tab rồi ẩn bằng `hidden` thay vì dựng theo điều kiện, hoặc
nâng phần trạng thái đang gõ lên `CounterHubPage`. Không đụng nghiệp vụ.

---

## 5. Quản lý — nghiệp vụ và trải nghiệm

### 5.1 Nghiệp vụ

| Việc | Chi tiết |
|---|---|
| Điều hành | Trung tâm điều hành: việc cần xử lý, sơ đồ bàn, trạng thái ca, doanh thu hôm nay |
| Thực đơn | Món, giá, danh mục, ảnh, nhãn, **thời gian lên món** |
| Bàn và QR | Sơ đồ, phiên đang mở, in mã, thêm/sửa/tắt bàn |
| Đơn | Xác nhận, từ chối, phục vụ, hoàn tất, huỷ, xác nhận thu, hoàn tiền |
| Khuyến mãi | Mã, loại, giá trị, giảm tối đa, đơn tối thiểu, khoảng ngày |
| Hội viên và ưu đãi | Hạng, phần thưởng, điểm cần, hạng tối thiểu |
| Tài khoản | Tạo, sửa, gán vai |
| Báo cáo | Khoảng ngày, doanh thu gộp/thực, giảm giá, món bán chạy, theo ngày |
| Giám sát quầy | Xem tiền theo ca — **không thao tác** |

### 5.2 Nguyên tắc trải nghiệm

**a. Dày là được, nhưng phải trả lời một câu hỏi.**

Khác hai vai kia: quản lý ngồi lâu, màn hình rộng, tay rảnh. Mật độ cao không phải vấn đề. Vấn đề
là **số không có ngữ cảnh**.

"Doanh thu hôm nay: 12.400.000đ" một mình không nói được gì. Phải kèm **so sánh**: so với hôm qua,
so với cùng thứ tuần trước. Một con số không có mốc so là một con số không hành động được.

**b. Sửa cấu hình phải nói trước nó ảnh hưởng tới đâu.**

Đây là ranh giới lớn nhất giữa vai quản lý và hai vai kia: **lỗi ở đây im lặng và lan rộng**. Bếp
bấm nhầm thì hỏng một món; quản lý gõ nhầm giá thì sai mọi đơn từ đó về sau, và không ai báo.

Nên mọi thay đổi có tầm ảnh hưởng rộng phải hiện **phạm vi ảnh hưởng** trước khi lưu:

- Đổi giá món → "Món này có trong **7 đơn đang mở**. Giá mới áp cho đơn đặt sau lúc lưu."
- Tắt món → "Đang có **3 phần** trong hàng đợi bếp. Tắt sẽ không huỷ chúng."
- Sửa thời gian lên món → "Ảnh hưởng con số ước lượng hiện cho khách ở mọi bàn."
- Xoá danh mục → đã chặn bằng `CATEGORY_HAS_MENU_ITEMS`, giữ nguyên.

**c. Trung tâm điều hành trả lời "cái gì cần tôi", không phải "hệ thống thế nào".**

Đã đúng hướng. Giữ nguyên nguyên tắc: mỗi khối là một việc mở ra được, không phải một chỉ số để
ngắm.

**d. Giám sát nhìn thấy, không chạm được.**

Ở màn quầy, quản lý chỉ có hai tab. Thiết kế phải làm cho việc "không chạm được" **hiển nhiên**,
không phải để nút đó rồi báo lỗi khi bấm: nút thao tác **không hiện**, kèm một dòng giải thích
("Xem tiền theo ca — thao tác thu/chốt do nhân viên quầy thực hiện").

Nút bị vô hiệu mà không nói lý do là cách tệ nhất: người dùng tưởng hệ thống hỏng.

### 5.3 Hiện trạng

Nguyên tắc (b) **đã đạt một nửa**. Tắt bán hàng loạt có hỏi lại và có nói hệ quả bằng lời:

> *"Ngừng bán 3 món? Những món này biến khỏi thực đơn khách đang xem ngay lập tức."*

Đó đúng là cảnh báo phạm vi, không phải "Bạn có chắc không?". Xoá món và xoá danh mục cũng hỏi lại.

Ba chỗ còn thiếu:

| Vấn đề | Hệ quả |
|---|---|
| Cảnh báo nói **hệ quả** nhưng chưa nói **số lượng** | "Biến khỏi thực đơn" đúng, nhưng thiếu vế "và **3 phần đang trong hàng đợi bếp** — tắt sẽ không huỷ chúng". Đó mới là thứ quyết định có nên tắt lúc này không |
| **Sửa giá** không cảnh báo gì | Đổi giá là thay đổi lan rộng nhất mà quản lý làm được, và hiện nó lặng lẽ hơn cả tắt một món |
| Số liệu không có mốc so | Báo cáo có tỷ lệ đơn đã trả và tỷ trọng món, nhưng **không so với hôm qua hay tuần trước**. Không biết 12,4 triệu là tốt hay tệ |

---

## 6. Luật giao diện dùng chung cả ba vai

Những thứ **không** đổi theo vai:

1. **Nhãn nói bằng ngôn ngữ người dùng, không bằng tên trạng thái trong mã.** Bếp thấy "Bắt đầu
   nấu", không thấy `Preparing`.
2. **Mỗi vai một màu nhấn**, đã có sẵn trong `tokens.css`: quản lý tím, quầy xanh, bếp cam. Màu
   nhấn chỉ để định vị "tôi đang ở đâu", **không** mang nghĩa trạng thái.
3. **Màu ngữ nghĩa tách khỏi màu vai**: thành công / cảnh báo / nguy hiểm dùng bộ riêng, không bao
   giờ trùng màu nhấn của vai.
4. **Tiêu điểm bàn phím luôn thấy được.** Không bao giờ tắt viền tiêu điểm — quầy dùng bàn phím
   nhiều hơn ta tưởng.
5. **Trạng thái kết nối realtime luôn hiện.** Cả ba màn đều dựa vào realtime; mất kết nối mà im
   lặng là để người ta ra quyết định trên dữ liệu cũ.
6. **Mọi màn có đường lùi thủ công** (nút làm mới), vì realtime có ngày hỏng.
7. **Tôn trọng `prefers-reduced-motion`.** Hiệu ứng nhấp nháy ở thẻ gấp phải tắt được.

---

## 7. Kiểm chứng thiết kế này thế nào

Thiết kế không kiểm được thì là ý kiến. Bốn phép thử làm được, không cần công cụ:

| Phép thử | Vai | Đạt khi |
|---|---|---|
| **Đứng lùi 2 mét** | Bếp | Đọc được tên món và số lượng mà không nheo mắt |
| **Đeo găng cao su chạm 20 lần** | Bếp | Không lần nào trúng nút bên cạnh |
| **Cắt ngang giữa chừng** | Quầy | Gõ dở số tiền → đổi tab → quay lại: số còn nguyên |
| **Đọc một con số** | Quản lý | Nói được ngay nó tốt hay tệ so với hôm qua |

Ba phép đầu làm tại chỗ trong 10 phút. Chúng bắt được thứ mà không phép kiểm tự động nào bắt được,
vì vấn đề nằm ở khoảng cách giữa màn hình và con người, không nằm trong mã.

---

## 8. Thứ tự làm

Xếp theo tỷ lệ giữa hại nếu không sửa và công bỏ ra.

| # | Việc | Vì sao ưu tiên thế |
|---|---|---|
| 1 | Bỏ vai `Staff`, di trú tài khoản sang `CounterStaff` | Đang có lỗi thật: màn hình mời làm việc mà máy chủ từ chối |
| 2 | Thang chữ và vùng chạm riêng cho bảng bếp | Ảnh hưởng mọi món của mọi bàn; sửa CSS, không đụng nghiệp vụ |
| 3 | Giữ dữ liệu đang gõ khi đổi tab ở quầy | Bị cắt ngang là trạng thái mặc định của vai này; sửa cách dựng tab, không đụng nghiệp vụ |
| 4 | Cảnh báo cho **sửa giá**, và thêm số lượng vào cảnh báo tắt món | Sửa giá là thay đổi lan rộng nhất mà hiện lặng lẽ nhất |
| 5 | Mốc so sánh cho số liệu quản lý | Không có nó thì báo cáo chỉ để nhìn |

Việc "hỏi lại khi chốt ca kèm con số lệch" **không có trong danh sách** vì đã làm rồi — xem §4.3.

Mục 1 là thay đổi **nghiệp vụ**, cần migration. Năm mục còn lại là giao diện, không đụng cơ sở dữ
liệu.
