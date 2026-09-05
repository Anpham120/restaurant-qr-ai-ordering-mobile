-- Thời gian lên món cho 34 món KHÔNG qua bếp.
--
-- V11 chỉ suy được `prep_minutes` từ nhãn `method:`, mà 34 món này không có nhãn nào — chúng không
-- được chế biến, chúng được pha hoặc lấy sẵn. Nên chúng để NULL, và khách không thấy ước lượng nào
-- cho hơn một phần ba thực đơn.
--
-- Vì sao tới giờ mới điền được: chỉ điền số thôi thì chưa đủ. Bản trước dùng MỘT hàng đợi cho cả
-- quán, nên một ly bia có `prep_minutes = 1` vẫn phải xếp sau toàn bộ việc bếp. Đo trên thực đơn
-- thật, ca tối 31 món (195 phút việc bếp): ly bia ra 30–49 phút. Số đó tệ hơn không có số.
--
-- Bản này đi cùng `TramChuanBi`: món pha chế có hàng đợi RIÊNG, món lấy sẵn KHÔNG xếp hàng.
--
-- CÁC CON SỐ DƯỚI ĐÂY LÀ CHỖ DỰA TẠM, KHÔNG PHẢI SỐ ĐÚNG — giống hệt tinh thần V11. Chúng là ước
-- lượng của người viết migration, không phải của quán. Khác V11 ở một chỗ quan trọng: giờ đã có
-- đường GHI (ô "Thời gian lên món" ở màn quản trị thực đơn), nên quán sửa lại được ngay khi thấy
-- sai — lời hứa mà V11 ghi ra nhưng chưa bao giờ thực hiện.
UPDATE public.menu_items SET prep_minutes = CASE category_id
    -- Mở nắp, rót ra ly. Con số này gần như chỉ là thời gian bưng.
    WHEN 'cat_alcohol' THEN 1
    -- Gọt và bày sẵn theo mẻ.
    WHEN 'cat_fruit'   THEN 3
    -- Chè, bánh flan: nấu sẵn theo mẻ, chỉ múc ra.
    WHEN 'cat_dessert' THEN 2
    -- Pha tại quầy: cà phê phin, trà ủ.
    WHEN 'cat_drink'   THEN 4
    -- Xay tại quầy: sinh tố, nước ép.
    WHEN 'cat_juice'   THEN 4
END
WHERE prep_minutes IS NULL
  AND category_id IN ('cat_alcohol', 'cat_fruit', 'cat_dessert', 'cat_drink', 'cat_juice');
