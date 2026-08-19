# Bước 1 — Từ điển dữ liệu thực đơn

Bản cũ **không có** tài liệu này, và đó là nguyên nhân trực tiếp của bảy lỗi. Tài liệu
này trả lời: mỗi trường trong thực đơn nghĩa là gì, mỗi nhãn nghĩa là gì, và — quan
trọng nhất — **khi một nhãn không có mặt thì kết luận được điều gì**.

Nguồn máy đọc: `data/menu-tags.json`, sinh bởi `ai/scripts/build_tag_dictionary.py`.

## 1. Hai nguồn thực đơn từng lệch nhau — đã hợp nhất

Ở bước 0 tôi viết "chỉ có một nguồn: `menu-dataset.json`". **Điều đó sai.** `/api/menu`
đọc `db.MenuItems`, tức cơ sở dữ liệu, không phải tệp JSON. Trạng thái trước khi sửa:

| | Cơ sở dữ liệu (khách thấy) | `menu-dataset.json` (AI dùng) |
|---|---|---|
| Nguồn | `RestaurantMenuSeed.cs`, migration `20260707233442` | tệp trong repo |
| Số món | 91 | 91 — **cùng tên, cùng mã** |
| Số nhãn khác nhau | 54 | 80 |
| Lần gán nhãn | 154 | 1.369 |
| Trung bình mỗi món | **1,7 nhãn** | **15,0 nhãn** |

Không migration nào sau `20260707` chạm vào `Tags`, nên khoảng cách này là trạng thái
hiện hành suốt từ đó. **Hệ quả:** bản AI cũ suy luận trên tập nhãn dày gấp gần chín lần
thứ ứng dụng thật phục vụ khách. Mọi con số đánh giá của nó đo trên dữ liệu giàu hơn
thực tế. Đây là lỗ hổng về giá trị của kết quả, không phải lỗi mã, và không test nào bắt
được vì hai nguồn chưa từng được so với nhau.

### Cách hợp nhất, và bằng chứng cho từng quyết định

Không thể hợp thẳng: **12 chỗ hai nguồn nói khác nhau**, trong đó 6 chỗ thuộc nhóm loại
trừ nên hợp lại sẽ tạo món có hai mức cay. Phải phân xử bằng nguồn thứ ba.

**Nhóm loại trừ (`spice`, `price`): tệp JSON thắng.** Phần mô tả món ghi thẳng độ cay
("Cay đậm.", "Không cay.") ở 63/91 món, và nhãn JSON khớp mô tả **63/63** — không một
ngoại lệ. Ba nhãn cay của cơ sở dữ liệu trái với mô tả:

| Món | Mô tả ghi | JSON | Cơ sở dữ liệu |
|---|---|---|---|
| Bún bò Huế | "Cay đậm." | `spice:hot` ✅ | `spice:medium` ❌ |
| Mực xào sa tế | "Cay đậm." | `spice:hot` ✅ | `spice:medium` ❌ |
| Gà nướng muối ớt xanh | "Cay vừa." | `spice:medium` ✅ | `spice:mild` ❌ |

Với `price` thì giá không phân xử được (dải chồng nhau: `mid` 35–280k, `high` 250–450k),
nhưng dưới chính thang của JSON, cơ sở dữ liệu gán `price:high` cho món 95.000đ (Cơm bò
lúc lắc) và 120.000đ (Sầu riêng Ri6) — trái thang đó. Và Tôm hùm 890.000đ, món đắt nhất
thực đơn, cơ sở dữ liệu gán `high` còn JSON gán `premium`.

**Nhóm còn lại: cộng thêm.** 14 nhãn từ cơ sở dữ liệu là thông tin thật mà JSON thiếu,
ví dụ `region:mekong` cho Bưởi da xanh Bến Tre — Bến Tre thuộc miền Tây, và nhãn này
cùng tồn tại với `region:south` được vì miền Tây nằm trong miền Nam.

**Bốn nhãn chỉ cơ sở dữ liệu có** được thu về, nâng từ điển từ 80 lên 84 nhãn:

| Nhãn cũ | Khóa mới | Nhóm | Món |
|---|---|---|---|
| `Hoi An` | `region:hoian` | vùng miền | Cơm gà Hội An, Cao lầu Hội An |
| `nong` | `serving:hot` | phục vụ | Súp măng cua |
| `pho bien` | `promo:popular` | **nhóm mới** | 3 món |
| `signature` | `promo:signature` | **nhóm mới** | 2 món |

`promo` là nhóm mới vì hai nhãn này thuộc **loại khác**: chúng nói cách nhà hàng giới
thiệu món, không phải thuộc tính của món. Trộn chung sẽ khiến "phổ biến" bị đối xử như
"cay vừa". Nhân đây, câu "món nào bán chạy" — thứ từng khớp sai vào nhãn `chay` (ăn
chay) do rút dấu — nay có câu trả lời thật.

Bốn nhãn này cũng chính là bốn mục "chết" trong bảng dịch tiếng Anh, dấu hiệu cho thấy
bảng đó được viết theo cơ sở dữ liệu chứ không theo tệp JSON.

### Trạng thái sau khi hợp nhất

| | Trước | Sau |
|---|---|---|
| Nhãn trong từ điển | 80 | **84** |
| Nhóm | 15 | **16** |
| Lần gán nhãn — cơ sở dữ liệu | 154 | **1.383** |
| Lần gán nhãn — tệp JSON | 1.369 | **1.383** |
| Món hai nguồn lệch nhãn | **91/91** | **0/91** |

Ba tệp cùng được cập nhật để không còn chỗ nào trôi được:

- `RestaurantMenuSeed.cs` — cho cơ sở dữ liệu **tạo mới**.
- `Migrations/20260729120000_RelabelsMenuTagsWithNamespacedKeys.cs` — cho cơ sở dữ liệu
  **đang chạy**. Seed một mình không đủ: production đã chạy migration seed từ 07/2026 nên
  nó giữ nhãn cũ tới khi có migration cập nhật. `Down()` trả lại đúng 154 nhãn cũ.
- `Migrations/RestaurantDbContextModelSnapshot.cs` — bắt buộc, vì nhãn seed qua `HasData`
  nên EF theo dõi chúng; không cập nhật thì lần `dotnet ef migrations add` sau sẽ sinh
  lại đúng phần khác biệt này.

> **Trạng thái kiểm chứng.** Máy phát triển không có .NET SDK, nên migration được kiểm qua
> CI: job `backend-test` đã qua bước `dotnet build` với migration này (run 30429447987), tức
> nó **biên dịch được**. Ngoài ra đã kiểm bằng cách khác: 91 câu `UPDATE` mỗi chiều, 91 mã
> món khác nhau, ngoặc cân, thụt lề hợp lệ cho chuỗi raw C#, và toàn bộ 154 nhãn cũ trong
> `Down()` đối chiếu khớp 91/91 với tệp seed ở commit trước khi sửa. **Chưa làm:** chạy
> `dotnet ef database update` trên một cơ sở dữ liệu thật — CI không chạy migration.

## 2. Các trường của một món

| Trường | Loại | Là sự thật hay nhãn suy ra | Ghi chú |
|---|---|---|---|
| `id` | chuỗi `m_001`…`m_091` | sự thật | khóa ổn định, dùng để tham chiếu |
| `name` | chuỗi | sự thật | tên hiển thị, có dấu |
| `description` | chuỗi | sự thật, nhưng **là câu giới thiệu** | không phải danh sách thành phần đầy đủ |
| `price` | số nguyên (đồng) | sự thật | 12.000 – 890.000, trung vị 65.000 |
| `categoryId` / `categoryName` | chuỗi | sự thật | 13 danh mục, mỗi danh mục đúng 7 món |
| `imageUrl` | chuỗi | sự thật | |
| `isAvailable` | bool | sự thật *về lý thuyết* | **cả 91 món đều `true`** → không kiểm chứng được hành vi khi hết món |
| `tags` | danh sách khóa | **nhãn do người gán** | phần còn lại của tài liệu này nói về nó |

Điểm dễ nhầm nhất: `description` **không** phải bảng thành phần. Nó là câu quảng cáo có
kèm vài chi tiết. Dùng nó để khẳng định "món này không có X" là sai — xem mục 5.

## 3. Vì sao nhãn được gán lại thành khóa có không gian tên

Nhãn cũ là từ tiếng Việt trần: `toi`, `ca`, `nam`, `cua`, `chay`. Để khớp với cách khách
gõ (thường không dấu), bản cũ rút dấu rồi so chuỗi — và cả bảy lỗi đều sinh ra ở đây:

| Nhãn | Nghĩa thật | Đụng từ | Hậu quả đã xảy ra |
|---|---|---|---|
| `cua` | con cua | của, cửa | câu hỏi giờ mở cửa bị gán dị ứng hải sản |
| `chay` | ăn chay | chạy | "món bán chạy" khớp vào món chay |
| `trung` | trứng | miền Trung | dị ứng trứng loại 43/91 món, chỉ 7 món đúng |
| `bo` | bơ (nguồn sữa) | bò | dị ứng sữa loại cả phở bò |
| `muc` | mực | mức | "chọn mức đường" khớp vào mực |
| `lac` | đậu lạc | lắc | "bò lúc lắc" khớp vào đậu phộng |
| `tra` | trà | tráng | "tráng miệng menu" trả về bốn loại trà |

Khớp theo biên từ cũng không cứu được, vì **ba nhãn có token nằm trong nhãn khác**:
`nam` (nấm) nằm trong `quanh nam` và `mien Nam`; `ca` (cá) nằm trong `ca nhan`.

Và nhãn nhập nhằng nhất là `toi`, có trên 64/91 món: "tối" (bữa tối) hay "tỏi" (gia vị)?
Bản cũ đoán là "tỏi".

**Câu trả lời đã có sẵn trong repo suốt thời gian đó.**
`frontend/src/components/menu/MenuItemCard.tsx` chứa từ điển 80 nhãn → nhãn tiếng Việt
do người làm giao diện viết, phủ đúng 80/80 nhãn, và ghi rõ `"toi": "Tối"`. Bốn phép thử
độc lập trên dữ liệu cũng cho cùng kết luận: Tráng miệng 7/7, Trái cây tươi 7/7 và
Bia & Rượu 7/7 đều mang nhãn `toi`, mà không món nào trong đó có tỏi.

Bài học không phải "cần cẩn thận hơn" mà là: **tri thức này nằm ở ba nơi tách biệt và
không có gì canh chúng khỏi trôi khỏi nhau.** Nay chỉ còn một nguồn, và có test canh.

Khóa mới xóa cả lớp lỗi này về mặt cấu trúc, chứ không vá từng ca: khách không bao giờ
gõ chuỗi `meal:dinner`, nên không còn gì để trùng.

## 4. Mười sáu nhóm nhãn

Mọi khóa có dạng `nhóm:giá_trị`. Cột "Số món" đếm số món mang **ít nhất một** nhãn của
nhóm đó — con số quan trọng nhất trong bảng, vì nó quyết định có được suy luận từ việc
thiếu nhãn hay không (mục 5).

| Nhóm | Số nhãn | Loại trừ | Số món | Giá trị |
|---|---|---|---|---|
| `meal` | 4 | — | **91/91** | `breakfast`, `lunch`, `dinner`, `late_night` |
| `party` | 6 | — | **91/91** | `solo`, `two_three`, `three_five`, `share`, `friends`, `family` |
| `price` | 4 | **có** | **91/91** | `budget`, `mid`, `high`, `premium` |
| `season` | 4 | — | **91/91** | `all_year`, `hot_season`, `cold_season`, `cooling` |
| `spice` | 4 | **có** | **91/91** | `none`, `mild`, `medium`, `hot` |
| `occasion` | 6 | — | 79/91 | `everyday`, `banquet`, `birthday`, `business`, `date`, `drinking` |
| `flavour` | 6 | — | 72/91 | `rich`, `fatty`, `sour`, `sweet`, `salty`, `smoky` |
| `health` | 6 | — | 67/91 | `healthy`, `light`, `low_calorie`, `low_fat`, `high_protein`, `no_msg` |
| `region` | 10 | — | 65/91 | `north`, `central`, `south`, `mekong`, `hanoi`, `hue`, `saigon`, `danang`, `highlands`, `hoian` |
| `ingredient` | 10 | — | 57/91 | `beef`, `pork`, `chicken`, `fish`, `shrimp`, `squid`, `crab`, `tofu`, `mushroom`, `vegetable` |
| `method` | 10 | — | 57/91 | `grilled`, `fried`, `steamed`, `stir_fried`, `braised`, `boiled`, `roasted`, `stewed`, `simmered`, `rolled` |
| `audience` | 2 | — | 52/91 | `child`, `elderly` |
| `allergen` | 5 | — | 44/91 | `seafood`, `peanut`, `egg`, `dairy`, `gluten` |
| `serving` | 3 | — | 24/91 | `preorder`, `takeaway`, `hot` |
| `diet` | 2 | — | 17/91 | `vegetarian`, `vegan` |
| `promo` | 2 | — | 4/91 | `popular`, `signature` |

**Loại trừ** nghĩa là một món chỉ được mang đúng một giá trị của nhóm. Nếu một món vừa
`spice:none` vừa `spice:hot` thì không câu trả lời nào về độ cay của nó đúng được. Đã
kiểm: 0/91 món vi phạm, và có test canh.

Mỗi nhãn có ba dạng, trong `menu-tags.json`:

```
"meal:dinner": { "group": "meal", "value": "dinner",
                 "label_vi": "Tối", "label_en": "Dinner",
                 "legacy_key": "toi", "exclusive": false }
```

- `meal:dinner` — khóa AI khớp chính xác.
- `label_vi` / `label_en` — chữ khách đọc.
- `legacy_key` — tên cũ, giữ lại vì `/api/menu` vẫn trả về dạng đó (mục 1).

## 5. Điều quan trọng nhất: thiếu nhãn nghĩa là gì

Đây là chỗ bản cũ sai nguy hiểm nhất, và là lý do tài liệu này tồn tại.

Năm nhóm phủ **91/91** — `meal`, `party`, `price`, `season`, `spice`. Với chúng, thiếu
nhãn là **bất thường về dữ liệu**, không phải thông tin. Có thể lọc thẳng.

Mười một nhóm còn lại **không phủ hết**. Với chúng, thiếu nhãn nghĩa là *chưa ghi nhận*,
**không** phải *không có*. `allergen` chỉ phủ 44/91: bốn mươi bảy món không mang nhãn dị
nguyên nào — và điều đó không cho phép nói chúng không chứa dị nguyên.

**Bằng chứng, không phải suy đoán.** Đối chiếu nhãn với mô tả món tìm ra bảy lỗ nhãn thật:

| Món | Nhãn thiếu | Căn cứ trong mô tả |
|---|---|---|
| Bún đậu mắm tôm | `allergen:seafood` | "Chấm mắm tôm pha chanh đường ớt" |
| Cơm cá kho tộ | `allergen:seafood` | "Cá basa phi lê kho tộ" |
| Cá lóc nướng trui | `allergen:seafood` | "Cá lóc đồng nướng", "chấm mắm nêm" |
| Lẩu chua cá lăng | `allergen:seafood` | "Cá lăng cắt khúc (~800g)" |
| Bánh tráng cuốn thịt heo | `allergen:seafood` | "chấm mắm nêm tỏi ớt" |
| Bê thui Cầu Mống | `allergen:seafood` | "chấm mắm nêm cay" |
| Cua rang me | `allergen:gluten` | "Ăn kèm bánh mì nóng" |

Bảy nhãn này đã được bổ sung (`allergen:seafood` 20→26, `gluten` 6→7, số món có nhãn dị
nguyên 39→44). Chỉ bổ sung theo chiều **làm chặt hơn**, không bao giờ bớt nhãn, vì căn cứ
là mô tả trên thực đơn — **không phải kiểm tra bếp**.

**Phép thử tìm ra bảy lỗ đó, ban đầu chính nó cũng sai** — đúng lớp lỗi mà nó đi tìm:
`ốc` khớp vào "cốc 330ml" (Bia hơi), `cá` khớp vào "các loại rau" (Gỏi cuốn chay), và tôi
xếp `bánh tráng` vào gluten dù bánh tráng làm từ **gạo**. Nên nay có bản rà riêng,
`scripts/audit_allergen_tags.py`, làm ba việc bản đầu không làm:

1. khớp theo **biên từ**, không khớp chuỗi con;
2. bỏ qua **câu phủ định** — Gỏi cuốn chay ghi rõ "không hải sản" và Cơm chiên chay ngũ sắc
   ghi "không trứng", nên chúng đúng khi không mang nhãn;
3. giữ một danh sách **từ nghe giống dị nguyên nhưng không phải** (11 từ: `bánh tráng`,
   `bún`, `phở`, `hủ tiếu` đều là bột gạo; `bơ Đắk Lắk` là quả bơ; `kem` trong "thịt vàng
   kem" là màu của sầu riêng), để lỗi cũ không lặp lại.

Bản rà mở rộng lên hơn 40 từ khóa cho cả 5 loại dị nguyên và **không tìm thêm lỗ nào** —
tức bảy nhãn bổ sung đã phủ hết những gì phần mô tả tiết lộ. Nó chạy trong CI, và **không
tự sửa dữ liệu**: gán nhãn dị nguyên ảnh hưởng sức khỏe nên phải có người xét.

**Ba kết luận bắt buộc cho thiết kế:**

1. Lọc dị nguyên phải **fail-closed**: loại món khi có nhãn, và loại cả khi mô tả nêu
   thành phần đó. Không suy ra "an toàn" từ việc thiếu nhãn.
2. AI **không được** nói một món an toàn với người dị ứng. Chỉ được nói thực đơn *ghi
   nhận* hoặc *không ghi nhận*, và luôn mở đường hỏi nhân viên.
3. Với nhóm không phủ hết như `spice` thì ngược lại: `spice` phủ 91/91 nên lọc "không
   cay" là kết luận được. Nhưng `diet` chỉ phủ 17/91, nên thiếu `diet:vegetarian`
   **không** nghĩa là món có thịt.

Bảng phân tuyến:

| Nhóm | Phủ | Thiếu nhãn thì kết luận gì | Cách lọc |
|---|---|---|---|
| `meal`, `party`, `price`, `season`, `spice` | 91/91 | lỗi dữ liệu | lọc thẳng |
| `allergen` | 44/91 | **chưa ghi nhận** — không kết luận | fail-closed + đối chiếu mô tả + luôn nhắc hỏi nhân viên |
| `diet`, `audience`, `serving`, `health` | 17–67/91 | chưa ghi nhận | chỉ dùng theo chiều khẳng định |
| `ingredient`, `method`, `region`, `flavour`, `occasion` | 57–78/91 | chưa ghi nhận | dùng để gợi ý, không dùng để loại trừ |

## 6. Cách kiểm chứng

Từ điển và dữ liệu sinh lại được, và chạy lại nhiều lần cho cùng kết quả:

```
python ai/scripts/build_tag_dictionary.py --check   # chỉ kiểm, không ghi
python ai/scripts/build_tag_dictionary.py           # ghi từ điển + gán nhãn lại
```

`frontend/src/components/menu/menuTagDictionary.test.ts` canh phần dễ trôi nhất — tám ca,
và đã được chứng minh bắt được lỗi thật, không chỉ xanh:

| Ca | Chặn điều gì |
|---|---|
| phủ mọi nhãn trong thực đơn | nhãn dùng mà thiếu định nghĩa |
| nhãn tiếng Việt cho mọi khóa | đã thử đổi `"Tối"`→`"Tỏi"`, test đỏ đúng chỗ |
| nhãn tiếng Anh cho mọi khóa | bản viết tay cũ chỉ phủ 54/80 |
| tên nhãn cũ vẫn hiển thị đúng | đã thử xóa alias `binh dan`, test đỏ |
| nhãn lạ trả về nguyên văn | chiều ngược: chứng minh hàm thật sự tra bảng |
| khóa không lồng vào nhau | chính lỗi `nam` ⊂ `quanh nam` của bản cũ |
| **hai nguồn mang cùng bộ nhãn** | đã thử bỏ một nhãn khỏi tệp seed, test đỏ đúng món |
| nhóm loại trừ chỉ một giá trị | món có hai mức cay |

Ca áp chót là quan trọng nhất, vì chính sự trôi âm thầm giữa hai nguồn đã gây ra toàn bộ
vấn đề ở mục 1 — và trước đó không có gì so chúng với nhau.

Trạng thái: 114 test frontend xanh, typecheck sạch cả 12 workspace, cả hai công cụ sinh
chạy lại nhiều lần cho cùng kết quả.

## 7. Còn lại chưa giải quyết

1. **Migration đã biên dịch được, nhưng chưa chạy trên cơ sở dữ liệu nào.** CI
   (`backend-test`) đã qua bước `dotnet build` với migration này, nên nó hợp lệ về mặt biên
   dịch. Vẫn cần `dotnet ef database update` trên một cơ sở dữ liệu thật để biết 91 câu
   `UPDATE` chạy đúng — CI không chạy migration.
2. **Nhãn dị nguyên vẫn có thể còn thiếu.** Bản rà (`scripts/audit_allergen_tags.py`,
   hơn 40 từ khóa cho 5 loại, khớp theo biên từ, xử câu phủ định) **không tìm thêm lỗ nào**
   ngoài bảy lỗ đã bổ sung. Nhưng nó chỉ đọc được những gì phần mô tả nói ra, và mô tả
   không phải bảng thành phần — nên còn thiếu bao nhiêu thì **không biết được từ dữ liệu
   này**. Chỉ nhà hàng trả lời được.
3. **`isAvailable` toàn `true`** — hành vi khi hết món không kiểm chứng được.
4. **Nhãn là do người gán, không phải đo.** `health:healthy`, `flavour:rich` là đánh giá
   cảm quan của người nhập liệu. Dùng để gợi ý được, dùng để khẳng định thì không.
