-- Thời gian TỪ LÚC NHẬN ĐƠN TỚI LÚC MÓN SẴN SÀNG, do nhà hàng khai (hạn chế #10).
--
-- Vì sao cần cột này khi đã có ước lượng thống kê: bản cũ chỉ dựa vào lịch sử và cần 20 mẫu cho
-- TỪNG MÓN. Đo trên hệ thống đang chạy: 0 mẫu. Quán mới mở, món ít gọi, hoặc món vừa thêm vào
-- thực đơn sẽ im lặng hàng tuần — có khi mãi mãi với món hiếm. Một con số do bếp khai không phải
-- là phỏng đoán: đó là kiến thức nghiệp vụ, và nó có ngay từ ngày đầu.
--
-- ĐÂY LÀ "THỜI GIAN LÊN MÓN", KHÔNG PHẢI "THỜI GIAN NẤU".
--
-- Phở ninh nước dùng cả đêm nhưng múc ra bát chỉ vài phút. Thịt kho, cá hầm cũng kho sẵn theo mẻ.
-- Nếu điền tổng thời gian nấu thì mọi món nước sẽ báo hàng tiếng và không ai tin app nữa.
ALTER TABLE public.menu_items ADD COLUMN prep_minutes integer;

COMMENT ON COLUMN public.menu_items.prep_minutes IS
    'Phút từ lúc bếp nhận món tới lúc món sẵn sàng. NULL = chưa khai, không ước lượng được.';

-- GIÁ TRỊ KHỞI TẠO LÀ CHỖ DỰA TẠM, KHÔNG PHẢI SỐ ĐÚNG.
--
-- Suy từ nhãn `method:` — nhóm nhãn duy nhất trong kho nói về cách chế biến, và đã có cổng CI
-- canh (`ai/scripts/audit_method_tags.py --check`). Con số dưới đây là ước lượng của người viết
-- migration, KHÔNG phải của bếp:
--
--     cuốn 5 · ninh/nấu 6 · kho 8 · luộc 8 · hầm 10 · xào 10
--     chiên 12 · hấp 15 · nướng 15 · quay 20 · quay nguyên con 35
--
-- Món nước (`simmered`, 21 món) để 6 phút vì nước dùng ninh sẵn — chỉ chần bánh và múc. Món kho
-- và hầm cũng thấp vì nấu sẵn theo mẻ. Đó là hai chỗ mà "thời gian nấu" và "thời gian lên món"
-- lệch nhau xa nhất.
--
-- 34/91 món KHÔNG có nhãn method nên để NULL. Chúng sẽ không có ước lượng — im lặng đúng, hơn là
-- một con số bịa.
--
-- Bếp sửa lại qua `PATCH /api/admin/menu-items/{id}` khi thấy sai. Migration này chỉ chạy MỘT LẦN
-- và không ghi đè giá trị đã có.
UPDATE public.menu_items SET prep_minutes = CASE
    WHEN 'method:rolled'      = ANY(tags) THEN 5
    WHEN 'method:simmered'    = ANY(tags) THEN 6
    WHEN 'method:braised'     = ANY(tags) THEN 8
    WHEN 'method:boiled'      = ANY(tags) THEN 8
    WHEN 'method:stewed'      = ANY(tags) THEN 10
    WHEN 'method:stir_fried'  = ANY(tags) THEN 10
    WHEN 'method:fried'       = ANY(tags) THEN 12
    WHEN 'method:steamed'     = ANY(tags) THEN 15
    WHEN 'method:grilled'     = ANY(tags) THEN 15
    WHEN 'method:roasted'     = ANY(tags) THEN 20
    WHEN 'method:whole_roast' = ANY(tags) THEN 35
    ELSE NULL
END
WHERE prep_minutes IS NULL;
