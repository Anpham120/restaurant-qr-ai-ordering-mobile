-- Thực đơn demo của quán: mở rộng 16 món của V30 lên 32 món, đủ để chạy thử và trình bày.
--
-- Vì sao là migration MỚI chứ không sửa V30: V30 và V31 ĐÃ CHẠY. Flyway lưu checksum từng tệp,
-- nên sửa một migration đã áp là làm hỏng mọi cơ sở dữ liệu đang có dữ liệu. Cùng lý do đã ghi
-- trong scripts/menu-tags/build_tag_migration.py.
--
-- Vì sao chỉ thêm vào BẢY danh mục cũ, không mở danh mục mới: TramChuanBi.java quyết định món
-- xếp hàng ở đâu bằng một danh sách MÃ DANH MỤC viết cứng (DANH_MUC_QUAY, DANH_MUC_SAN). Danh mục
-- lạ rơi về BEP — tức một ly trà mới sẽ phải xếp sau hàng đợi bếp và ước lượng sai hẳn. Thêm
-- danh mục là phải sửa cả enum đó; đợt này cố ý không đụng tới.
--
-- Giá nằm trong khoảng 22.000–55.000 của thực đơn sẵn có. Đây là số DEMO, chưa phải giá bán.

INSERT INTO public.menu_items(id,category_id,name,description,price,image_url,is_available,tags,prep_minutes,created_at,updated_at) VALUES
-- Matcha
('shop_matcha_blended','shop_matcha','Matcha đá xay','Matcha xay mịn cùng sữa, phủ kem tươi. Mát lạnh từ ngụm đầu tới ngụm cuối.',55000,'/shop-assets/matcha.png',true,ARRAY['Món mới'],7,now(),now()),
('shop_matcha_yuzu','shop_matcha','Matcha yuzu','Matcha thanh nhẹ gặp yuzu chua dịu, hậu vị thơm vỏ cam.',52000,'/shop-assets/matcha.png',true,ARRAY['Tươi mát'],6,now(),now()),
-- Cà phê
('shop_coffee_black','shop_coffee','Cà phê đen đá','Phin đen nguyên bản, đắng đậm và tỉnh táo.',25000,'/shop-assets/coffee.png',true,ARRAY['Quen mà ngon'],5,now(),now()),
('shop_coffee_bacxiu','shop_coffee','Bạc xỉu','Nhiều sữa, ít cà phê. Ngọt dịu cho người mới bắt đầu.',32000,'/shop-assets/coffee.png',true,ARRAY['Ngọt vừa'],5,now(),now()),
('shop_coffee_coldbrew','shop_coffee','Cold brew cam sả','Cà phê ủ lạnh mười hai tiếng, thêm cam tươi và sả thơm.',45000,'/shop-assets/coffee.png',true,ARRAY['Món mới'],4,now(),now()),
-- Trà trái cây
('shop_tea_guava','shop_tea','Trà ổi hồng','Trà xanh cùng ổi hồng ép tươi, ngọt thanh và thơm nhẹ.',42000,'/shop-assets/tea.png',true,ARRAY['Tươi mát'],5,now(),now()),
('shop_tea_lotus','shop_tea','Trà sen vàng','Trà ướp sen, hạt sen mềm và chút mật ong.',39000,'/shop-assets/tea.png',true,ARRAY['Thanh nhẹ'],5,now(),now()),
-- Chè nhà làm
('shop_che_khucbach','shop_che','Chè khúc bạch','Khúc bạch mềm mịn, hạnh nhân rang và vải ngọt mát.',39000,'/shop-assets/che.png',true,ARRAY['Bán chạy','Nhà làm'],5,now(),now()),
('shop_che_redbean','shop_che','Chè đậu đỏ cốt dừa','Đậu đỏ ninh mềm, nước cốt dừa béo thơm, đá bào mát lạnh.',29000,'/shop-assets/che.png',true,ARRAY['Nhà làm'],4,now(),now()),
-- Kem
('shop_icecream_matcha','shop_icecream','Kem trà xanh','Kem trà xanh đắng nhẹ, mịn và thơm lá trà.',39000,'/shop-assets/icecream.png',true,ARRAY['Mát lành'],3,now(),now()),
('shop_icecream_mint','shop_icecream','Kem socola bạc hà','Socola đắng và bạc hà the mát, hai vị cân nhau.',39000,'/shop-assets/icecream.png',true,ARRAY['Mát lành'],3,now(),now()),
-- Bánh ngọt
('shop_bakery_choux','shop_bakery','Bánh su kem','Vỏ su nhẹ, nhân kem trứng làm trong ngày.',22000,'/shop-assets/bakery.png',true,ARRAY['Nướng mỗi ngày'],3,now(),now()),
('shop_bakery_cheesecake','shop_bakery','Cheesecake chanh dây','Cheesecake mềm mát, lớp chanh dây chua dịu bên trên.',45000,'/shop-assets/tiramisu.png',true,ARRAY['Bán chạy'],3,now(),now()),
('shop_bakery_garlicbread','shop_bakery','Bánh mì bơ tỏi','Bánh mì nướng giòn, bơ tỏi thơm và chút rau thơm.',25000,'/shop-assets/bakery.png',true,ARRAY['Nướng mỗi ngày'],6,now(),now()),
-- Ăn nhẹ
('shop_snack_bantrangtron','shop_snack','Bánh tráng trộn','Bánh tráng, khô bò, trứng cút và rau răm, trộn khi có khách gọi.',30000,'/shop-assets/snack.png',true,ARRAY['Ăn cùng bạn'],6,now(),now()),
('shop_snack_sausage','shop_snack','Xúc xích nướng','Xúc xích nướng nóng, tương ớt và tương cà.',35000,'/shop-assets/chicken.png',true,ARRAY['Ăn cùng bạn'],9,now(),now());

-- Nhóm tuỳ chọn cho đồ uống pha tại quầy.
--
-- CHỈ áp cho các mã vừa thêm ở trên, không dùng `WHERE category_id IN (...)`: câu đó sẽ ghi đè
-- luôn 7 món của V30, xoá mất mọi chỉnh tay của người bán. V31 đã đặt ra nếp này khi sửa ảnh —
-- "Merchant-supplied photographs are preserved."
UPDATE public.menu_items SET option_groups_json = '[
 {"id":"size","name":"Kích cỡ","minSelections":1,"maxSelections":1,"options":[{"id":"size_m","name":"Vừa · M","price":0,"isAvailable":true},{"id":"size_l","name":"Lớn · L","price":10000,"isAvailable":true}]},
 {"id":"sugar","name":"Đường","minSelections":1,"maxSelections":1,"options":[{"id":"sugar_0","name":"Không đường","price":0,"isAvailable":true},{"id":"sugar_50","name":"50% đường","price":0,"isAvailable":true},{"id":"sugar_100","name":"100% đường","price":0,"isAvailable":true}]},
 {"id":"ice","name":"Đá","minSelections":1,"maxSelections":1,"options":[{"id":"ice_0","name":"Không đá","price":0,"isAvailable":true},{"id":"ice_50","name":"Ít đá","price":0,"isAvailable":true},{"id":"ice_100","name":"Đá bình thường","price":0,"isAvailable":true}]},
 {"id":"topping","name":"Thêm chút ngon","minSelections":0,"maxSelections":2,"options":[{"id":"topping_pearl","name":"Trân châu trắng","price":5000,"isAvailable":true},{"id":"topping_cream","name":"Kem cheese","price":10000,"isAvailable":true}]}
]', updated_at = now()
WHERE id IN ('shop_matcha_yuzu','shop_coffee_black','shop_coffee_bacxiu','shop_coffee_coldbrew',
             'shop_tea_guava','shop_tea_lotus');

-- Đá xay KHÔNG có nhóm "Đá".
--
-- Món xay nhuyễn với đá thì "không đá" là một lựa chọn không pha được. Bày một ô mà nhân viên
-- phải từ chối sau đó là bắt khách phát hiện giới hạn của quán bằng cách va vào nó.
UPDATE public.menu_items SET option_groups_json = '[
 {"id":"size","name":"Kích cỡ","minSelections":1,"maxSelections":1,"options":[{"id":"size_m","name":"Vừa · M","price":0,"isAvailable":true},{"id":"size_l","name":"Lớn · L","price":10000,"isAvailable":true}]},
 {"id":"sugar","name":"Đường","minSelections":1,"maxSelections":1,"options":[{"id":"sugar_0","name":"Không đường","price":0,"isAvailable":true},{"id":"sugar_50","name":"50% đường","price":0,"isAvailable":true},{"id":"sugar_100","name":"100% đường","price":0,"isAvailable":true}]},
 {"id":"topping","name":"Thêm chút ngon","minSelections":0,"maxSelections":2,"options":[{"id":"topping_pearl","name":"Trân châu trắng","price":5000,"isAvailable":true},{"id":"topping_cream","name":"Kem cheese","price":10000,"isAvailable":true}]}
]', updated_at = now()
WHERE id = 'shop_matcha_blended';

UPDATE public.menu_items SET option_groups_json = '[
 {"id":"topping","name":"Thêm topping","minSelections":0,"maxSelections":2,"options":[{"id":"topping_coconut","name":"Cốt dừa","price":5000,"isAvailable":true},{"id":"topping_jelly","name":"Thạch lá dứa","price":5000,"isAvailable":true}]}
]', updated_at = now()
WHERE id IN ('shop_che_khucbach','shop_che_redbean');

UPDATE public.menu_items SET option_groups_json = '[
 {"id":"serving","name":"Phần kem","minSelections":1,"maxSelections":1,"options":[{"id":"scoop_1","name":"Một viên","price":0,"isAvailable":true},{"id":"scoop_2","name":"Hai viên","price":20000,"isAvailable":true}]},
 {"id":"topping","name":"Thêm topping","minSelections":0,"maxSelections":2,"options":[{"id":"topping_coconut","name":"Dừa sợi","price":5000,"isAvailable":true},{"id":"topping_chocolate","name":"Sốt chocolate","price":5000,"isAvailable":true}]}
]', updated_at = now()
WHERE id IN ('shop_icecream_matcha','shop_icecream_mint');

-- Bánh ngọt và ăn nhẹ giữ `option_groups_json` mặc định '[]' của V30: không có gì để chọn, và
-- một nhóm tuỳ chọn rỗng vẫn tốn một bước chạm của khách.
