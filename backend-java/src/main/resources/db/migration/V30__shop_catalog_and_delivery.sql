-- Additive shop migration. Existing restaurant categories, menu and orders are preserved.
ALTER TABLE public.menu_items ADD COLUMN option_groups_json text NOT NULL DEFAULT '[]';
ALTER TABLE public.order_items ADD COLUMN selection_note text;
ALTER TABLE public.order_status_history ALTER COLUMN note TYPE text;
UPDATE public.order_items SET selection_note = note WHERE note IS NOT NULL;
ALTER TABLE public.orders
    ADD COLUMN customer_user_id varchar(50),
    ADD COLUMN courier_id varchar(50),
    ADD COLUMN fulfillment_status varchar(30),
    ADD COLUMN cod_accepted boolean NOT NULL DEFAULT false,
    ADD COLUMN delivery_latitude double precision,
    ADD COLUMN delivery_longitude double precision,
    ADD COLUMN delivery_distance_km numeric(12,3);
CREATE INDEX ix_orders_customer_user ON public.orders(customer_user_id, created_at DESC);
CREATE INDEX ix_orders_courier ON public.orders(courier_id, updated_at DESC);
ALTER TABLE public.orders ADD CONSTRAINT ck_orders_fulfillment_status CHECK
    (fulfillment_status IS NULL OR fulfillment_status IN ('Assigned','OutForDelivery','Delivered','Failed'));
CREATE TABLE public.shop_settings (id varchar(50) PRIMARY KEY, settings_json text NOT NULL);

INSERT INTO public.categories(id,name,display_order,is_active,created_at,updated_at) VALUES
('shop_matcha','Matcha',101,true,now(),now()),
('shop_coffee','Cà phê',102,true,now(),now()),
('shop_tea','Trà trái cây',103,true,now(),now()),
('shop_che','Chè nhà làm',104,true,now(),now()),
('shop_icecream','Kem',105,true,now(),now()),
('shop_bakery','Bánh ngọt',106,true,now(),now()),
('shop_snack','Ăn nhẹ',107,true,now(),now());

INSERT INTO public.menu_items(id,category_id,name,description,price,image_url,is_available,tags,prep_minutes,created_at,updated_at) VALUES
('shop_matcha_latte','shop_matcha','Matcha latte','Matcha thơm dịu, sữa tươi béo nhẹ. Một chút xanh cho ngày dễ chịu.',45000,'/shop-assets/matcha.png',true,ARRAY['Bán chạy','station:bar'],5,now(),now()),
('shop_matcha_coconut','shop_matcha','Matcha dừa','Matcha đậm vị hòa cùng nước dừa và lớp kem dừa mềm.',49000,'/shop-assets/matcha.png',true,ARRAY['Món mới','station:bar'],6,now(),now()),
('shop_coffee_milk','shop_coffee','Cà phê sữa đá','Cà phê phin đậm đà với sữa đặc, thức tỉnh buổi sáng.',29000,'/shop-assets/coffee.png',true,ARRAY['Quen mà ngon','station:bar'],5,now(),now()),
('shop_coffee_salt','shop_coffee','Cà phê muối','Cà phê rang đậm dưới lớp kem muối mịn, cân bằng ngọt và mặn.',39000,'/shop-assets/coffee.png',true,ARRAY['Bán chạy','station:bar'],6,now(),now()),
('shop_tea_peach','shop_tea','Trà đào cam sả','Trà thơm hương sả, cam tươi và những miếng đào giòn.',39000,'/shop-assets/tea.png',true,ARRAY['Tươi mát','station:bar'],5,now(),now()),
('shop_tea_lychee','shop_tea','Trà vải lài','Trà lài thanh nhẹ, vải mọng nước và chút chua tươi.',39000,'/shop-assets/tea.png',true,ARRAY['Tươi mát','station:bar'],5,now(),now()),
('shop_tea_mango','shop_tea','Trà xoài nhiệt đới','Trà trái cây với xoài chín và hương chanh dây.',45000,'/shop-assets/tea.png',true,ARRAY['Món mới','station:bar'],6,now(),now()),
('shop_che_pomelo','shop_che','Chè bưởi','Cùi bưởi giòn, đậu xanh bùi và nước cốt dừa nhà làm.',29000,'/shop-assets/che.png',true,ARRAY['Nhà làm'],4,now(),now()),
('shop_che_thai','shop_che','Chè Thái','Trái cây, thạch mềm và cốt dừa béo thơm trong một ly đầy màu sắc.',35000,'/shop-assets/che.png',true,ARRAY['Bán chạy'],5,now(),now()),
('shop_che_lotus','shop_che','Chè sen long nhãn','Hạt sen mềm bùi và long nhãn, vị ngọt thanh dễ chịu.',35000,'/shop-assets/che.png',true,ARRAY['Thanh nhẹ'],4,now(),now()),
('shop_icecream_coconut','shop_icecream','Kem dừa non','Kem dừa mịn mát cùng dừa sợi và đậu phộng rang.',35000,'/shop-assets/icecream.png',true,ARRAY['Mát lành'],3,now(),now()),
('shop_icecream_strawberry','shop_icecream','Kem dâu sữa','Kem dâu chua ngọt nhẹ, thơm sữa và sốt dâu.',39000,'/shop-assets/icecream.png',true,ARRAY['Mát lành'],3,now(),now()),
('shop_croissant','shop_bakery','Croissant bơ','Bánh sừng bò nhiều lớp, vỏ giòn và ruột mềm thơm bơ.',29000,'/shop-assets/bakery.png',true,ARRAY['Nướng mỗi ngày'],5,now(),now()),
('shop_tiramisu','shop_bakery','Tiramisu cacao','Bánh kem mascarpone, cà phê và lớp cacao mịn.',45000,'/shop-assets/bakery.png',true,ARRAY['Ngọt vừa'],3,now(),now()),
('shop_fries','shop_snack','Khoai tây chiên','Khoai vàng giòn, dùng kèm sốt cà chua và mayonnaise.',35000,'/shop-assets/snack.png',true,ARRAY['Ăn cùng bạn'],10,now(),now()),
('shop_chicken','shop_snack','Gà viên giòn','Gà viên giòn nóng hổi, sốt chấm đậm vị.',45000,'/shop-assets/snack.png',true,ARRAY['Ăn cùng bạn'],12,now(),now());

UPDATE public.menu_items SET option_groups_json = '[
 {"id":"size","name":"Kích cỡ","minSelections":1,"maxSelections":1,"options":[{"id":"size_m","name":"Vừa · M","price":0,"isAvailable":true},{"id":"size_l","name":"Lớn · L","price":10000,"isAvailable":true}]},
 {"id":"sugar","name":"Đường","minSelections":1,"maxSelections":1,"options":[{"id":"sugar_0","name":"Không đường","price":0,"isAvailable":true},{"id":"sugar_50","name":"50% đường","price":0,"isAvailable":true},{"id":"sugar_100","name":"100% đường","price":0,"isAvailable":true}]},
 {"id":"ice","name":"Đá","minSelections":1,"maxSelections":1,"options":[{"id":"ice_0","name":"Không đá","price":0,"isAvailable":true},{"id":"ice_50","name":"Ít đá","price":0,"isAvailable":true},{"id":"ice_100","name":"Đá bình thường","price":0,"isAvailable":true}]},
 {"id":"topping","name":"Thêm chút ngon","minSelections":0,"maxSelections":2,"options":[{"id":"topping_pearl","name":"Trân châu trắng","price":5000,"isAvailable":true},{"id":"topping_cream","name":"Kem cheese","price":10000,"isAvailable":true}]}
]' WHERE category_id IN ('shop_matcha','shop_coffee','shop_tea');

UPDATE public.menu_items SET option_groups_json = '[
 {"id":"topping","name":"Thêm topping","minSelections":0,"maxSelections":2,"options":[{"id":"topping_coconut","name":"Cốt dừa","price":5000,"isAvailable":true},{"id":"topping_jelly","name":"Thạch lá dứa","price":5000,"isAvailable":true}]}
]' WHERE category_id = 'shop_che';

UPDATE public.menu_items SET option_groups_json = '[
 {"id":"serving","name":"Phần kem","minSelections":1,"maxSelections":1,"options":[{"id":"scoop_1","name":"Một viên","price":0,"isAvailable":true},{"id":"scoop_2","name":"Hai viên","price":20000,"isAvailable":true}]},
 {"id":"topping","name":"Thêm topping","minSelections":0,"maxSelections":2,"options":[{"id":"topping_coconut","name":"Dừa sợi","price":5000,"isAvailable":true},{"id":"topping_chocolate","name":"Sốt chocolate","price":5000,"isAvailable":true}]}
]' WHERE category_id = 'shop_icecream';
