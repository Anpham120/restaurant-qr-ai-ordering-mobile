# Thực đơn quán Mây

**32 món** trong **7 danh mục**. Trang này **được SINH RA** bởi
`scripts/menu/build_thuc_don.mjs` từ chính các migration đã seed thực đơn
(V30__shop_catalog_and_delivery.sql, V33__shop_demo_menu.sql) — nên nó không thể lệch giá hay lệch tên với cơ sở dữ liệu.

Đổi thực đơn: viết một migration MỚI rồi chạy `node scripts/menu/build_thuc_don.mjs`.
Không sửa migration đã chạy — Flyway lưu checksum từng tệp.

> Giá dưới đây là **số demo**, chưa phải giá bán.

## Matcha

| Món | Giá | Làm | Tuỳ chọn | Mô tả |
|---|---|---|---|---|
| Matcha latte | 45.000đ | 5′ | Kích cỡ · Đường · Đá · Thêm chút ngon | Matcha thơm dịu, sữa tươi béo nhẹ. Một chút xanh cho ngày dễ chịu. |
| Matcha dừa | 49.000đ | 6′ | Kích cỡ · Đường · Đá · Thêm chút ngon | Matcha đậm vị hòa cùng nước dừa và lớp kem dừa mềm. |
| Matcha đá xay | 55.000đ | 7′ | Kích cỡ · Đường · Thêm chút ngon | Matcha xay mịn cùng sữa, phủ kem tươi. Mát lạnh từ ngụm đầu tới ngụm cuối. |
| Matcha yuzu | 52.000đ | 6′ | Kích cỡ · Đường · Đá · Thêm chút ngon | Matcha thanh nhẹ gặp yuzu chua dịu, hậu vị thơm vỏ cam. |

## Cà phê

| Món | Giá | Làm | Tuỳ chọn | Mô tả |
|---|---|---|---|---|
| Cà phê sữa đá | 29.000đ | 5′ | Kích cỡ · Đường · Đá · Thêm chút ngon | Cà phê phin đậm đà với sữa đặc, thức tỉnh buổi sáng. |
| Cà phê muối | 39.000đ | 6′ | Kích cỡ · Đường · Đá · Thêm chút ngon | Cà phê rang đậm dưới lớp kem muối mịn, cân bằng ngọt và mặn. |
| Cà phê đen đá | 25.000đ | 5′ | Kích cỡ · Đường · Đá · Thêm chút ngon | Phin đen nguyên bản, đắng đậm và tỉnh táo. |
| Bạc xỉu | 32.000đ | 5′ | Kích cỡ · Đường · Đá · Thêm chút ngon | Nhiều sữa, ít cà phê. Ngọt dịu cho người mới bắt đầu. |
| Cold brew cam sả | 45.000đ | 4′ | Kích cỡ · Đường · Đá · Thêm chút ngon | Cà phê ủ lạnh mười hai tiếng, thêm cam tươi và sả thơm. |

## Trà trái cây

| Món | Giá | Làm | Tuỳ chọn | Mô tả |
|---|---|---|---|---|
| Trà đào cam sả | 39.000đ | 5′ | Kích cỡ · Đường · Đá · Thêm chút ngon | Trà thơm hương sả, cam tươi và những miếng đào giòn. |
| Trà vải lài | 39.000đ | 5′ | Kích cỡ · Đường · Đá · Thêm chút ngon | Trà lài thanh nhẹ, vải mọng nước và chút chua tươi. |
| Trà xoài nhiệt đới | 45.000đ | 6′ | Kích cỡ · Đường · Đá · Thêm chút ngon | Trà trái cây với xoài chín và hương chanh dây. |
| Trà ổi hồng | 42.000đ | 5′ | Kích cỡ · Đường · Đá · Thêm chút ngon | Trà xanh cùng ổi hồng ép tươi, ngọt thanh và thơm nhẹ. |
| Trà sen vàng | 39.000đ | 5′ | Kích cỡ · Đường · Đá · Thêm chút ngon | Trà ướp sen, hạt sen mềm và chút mật ong. |

## Chè nhà làm

| Món | Giá | Làm | Tuỳ chọn | Mô tả |
|---|---|---|---|---|
| Chè bưởi | 29.000đ | 4′ | Thêm topping | Cùi bưởi giòn, đậu xanh bùi và nước cốt dừa nhà làm. |
| Chè Thái | 35.000đ | 5′ | Thêm topping | Trái cây, thạch mềm và cốt dừa béo thơm trong một ly đầy màu sắc. |
| Chè sen long nhãn | 35.000đ | 4′ | Thêm topping | Hạt sen mềm bùi và long nhãn, vị ngọt thanh dễ chịu. |
| Chè khúc bạch | 39.000đ | 5′ | Thêm topping | Khúc bạch mềm mịn, hạnh nhân rang và vải ngọt mát. |
| Chè đậu đỏ cốt dừa | 29.000đ | 4′ | Thêm topping | Đậu đỏ ninh mềm, nước cốt dừa béo thơm, đá bào mát lạnh. |

## Kem

| Món | Giá | Làm | Tuỳ chọn | Mô tả |
|---|---|---|---|---|
| Kem dừa non | 35.000đ | 3′ | Phần kem · Thêm topping | Kem dừa mịn mát cùng dừa sợi và đậu phộng rang. |
| Kem dâu sữa | 39.000đ | 3′ | Phần kem · Thêm topping | Kem dâu chua ngọt nhẹ, thơm sữa và sốt dâu. |
| Kem trà xanh | 39.000đ | 3′ | Phần kem · Thêm topping | Kem trà xanh đắng nhẹ, mịn và thơm lá trà. |
| Kem socola bạc hà | 39.000đ | 3′ | Phần kem · Thêm topping | Socola đắng và bạc hà the mát, hai vị cân nhau. |

## Bánh ngọt

| Món | Giá | Làm | Tuỳ chọn | Mô tả |
|---|---|---|---|---|
| Croissant bơ | 29.000đ | 5′ | — | Bánh sừng bò nhiều lớp, vỏ giòn và ruột mềm thơm bơ. |
| Tiramisu cacao | 45.000đ | 3′ | — | Bánh kem mascarpone, cà phê và lớp cacao mịn. |
| Bánh su kem | 22.000đ | 3′ | — | Vỏ su nhẹ, nhân kem trứng làm trong ngày. |
| Cheesecake chanh dây | 45.000đ | 3′ | — | Cheesecake mềm mát, lớp chanh dây chua dịu bên trên. |
| Bánh mì bơ tỏi | 25.000đ | 6′ | — | Bánh mì nướng giòn, bơ tỏi thơm và chút rau thơm. |

## Ăn nhẹ

| Món | Giá | Làm | Tuỳ chọn | Mô tả |
|---|---|---|---|---|
| Khoai tây chiên | 35.000đ | 10′ | — | Khoai vàng giòn, dùng kèm sốt cà chua và mayonnaise. |
| Gà viên giòn | 45.000đ | 12′ | — | Gà viên giòn nóng hổi, sốt chấm đậm vị. |
| Bánh tráng trộn | 30.000đ | 6′ | — | Bánh tráng, khô bò, trứng cút và rau răm, trộn khi có khách gọi. |
| Xúc xích nướng | 35.000đ | 9′ | — | Xúc xích nướng nóng, tương ớt và tương cà. |

## Ảnh món

Ảnh hiện tại là **tranh minh hoạ theo danh mục**, nên nhiều món dùng chung một tệp.
Còn **30/32 món** chưa có ảnh riêng.

Quy cách: **768 × 768** PNG, 40–70 KB. Chép vào **cả hai** thư mục, cùng tên tệp —
`frontend/public/shop-assets/` (web đọc) và
`backend-java/src/main/resources/static/shop-assets/` (app di động và endpoint tĩnh đọc).
Thiếu một bên thì ảnh mất ở đúng một nền tảng.

| Món | Ảnh đang dùng | Tệp ảnh riêng cần làm |
|---|---|---|
| Matcha latte | `/shop-assets/matcha.png` | `matcha-latte.png` |
| Matcha dừa | `/shop-assets/matcha.png` | `matcha-coconut.png` |
| Matcha đá xay | `/shop-assets/matcha.png` | `matcha-blended.png` |
| Matcha yuzu | `/shop-assets/matcha.png` | `matcha-yuzu.png` |
| Cà phê sữa đá | `/shop-assets/coffee.png` | `coffee-milk.png` |
| Cà phê muối | `/shop-assets/coffee.png` | `coffee-salt.png` |
| Cà phê đen đá | `/shop-assets/coffee.png` | `coffee-black.png` |
| Bạc xỉu | `/shop-assets/coffee.png` | `coffee-bacxiu.png` |
| Cold brew cam sả | `/shop-assets/coffee.png` | `coffee-coldbrew.png` |
| Trà đào cam sả | `/shop-assets/tea.png` | `tea-peach.png` |
| Trà vải lài | `/shop-assets/tea.png` | `tea-lychee.png` |
| Trà xoài nhiệt đới | `/shop-assets/tea.png` | `tea-mango.png` |
| Trà ổi hồng | `/shop-assets/tea.png` | `tea-guava.png` |
| Trà sen vàng | `/shop-assets/tea.png` | `tea-lotus.png` |
| Chè bưởi | `/shop-assets/che.png` | `che-pomelo.png` |
| Chè Thái | `/shop-assets/che.png` | `che-thai.png` |
| Chè sen long nhãn | `/shop-assets/che.png` | `che-lotus.png` |
| Chè khúc bạch | `/shop-assets/che.png` | `che-khucbach.png` |
| Chè đậu đỏ cốt dừa | `/shop-assets/che.png` | `che-redbean.png` |
| Kem dừa non | `/shop-assets/icecream.png` | `icecream-coconut.png` |
| Kem dâu sữa | `/shop-assets/icecream.png` | `icecream-strawberry.png` |
| Kem trà xanh | `/shop-assets/icecream.png` | `icecream-matcha.png` |
| Kem socola bạc hà | `/shop-assets/icecream.png` | `icecream-mint.png` |
| Croissant bơ | `/shop-assets/bakery.png` | `croissant.png` |
| Tiramisu cacao | `/shop-assets/bakery.png` | — *(đã có)* |
| Bánh su kem | `/shop-assets/bakery.png` | `bakery-choux.png` |
| Cheesecake chanh dây | `/shop-assets/tiramisu.png` | `bakery-cheesecake.png` |
| Bánh mì bơ tỏi | `/shop-assets/bakery.png` | `bakery-garlicbread.png` |
| Khoai tây chiên | `/shop-assets/snack.png` | `fries.png` |
| Gà viên giòn | `/shop-assets/snack.png` | — *(đã có)* |
| Bánh tráng trộn | `/shop-assets/snack.png` | `snack-bantrangtron.png` |
| Xúc xích nướng | `/shop-assets/chicken.png` | `snack-sausage.png` |

