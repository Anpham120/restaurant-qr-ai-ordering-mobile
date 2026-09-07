-- Đổi tên kênh nhận món: Pickup -> Takeaway, và chặn dữ liệu giao hàng đi tiếp.
--
-- Phạm vi mới: quán chỉ phục vụ khách đang ở quán và khách tới quầy mua mang về. Không đặt trước
-- từ xa, không giao tận nhà. Xem docs/pm/CHOT_NGHIEP_VU_QUAN_P0.md §1.
--
-- Vì sao đổi tên chứ không giữ 'Pickup': từ đó gợi ý "đặt trước rồi tới lấy" — đúng thứ vừa bị
-- loại khỏi phạm vi. Giữ tên cũ là mời người đọc hiểu nhầm về sau. Đổi bây giờ còn rẻ vì chưa có
-- đơn thật nào mang giá trị đó ngoài máy cá nhân.

UPDATE public.orders SET order_type = 'Takeaway' WHERE order_type = 'Pickup';

-- DỪNG nếu còn đơn giao hàng.
--
-- Không tự đổi chúng thành Takeaway: một đơn giao tận nhà có địa chỉ, có phí ship, và có thể đã
-- thu tiền — biến nó thành đơn mang về là làm sai chứng từ tiền, im lặng. Nếu migration này dừng,
-- người vận hành phải xem từng đơn và quyết định, rồi mới chạy lại.
--
-- Trên bản triển khai thật thì không có đơn nào: production chạy `main`, mà `main` không có
-- Delivery. Khối này bảo vệ các cơ sở dữ liệu thử nghiệm đã kịp tạo đơn giao hàng.
DO $$
DECLARE con_lai bigint;
BEGIN
    SELECT count(*) INTO con_lai FROM public.orders WHERE order_type = 'Delivery';
    IF con_lai > 0 THEN
        RAISE EXCEPTION
            'Còn % đơn Delivery. Giao tận nhà đã ra khỏi phạm vi; xử lý từng đơn rồi chạy lại — '
            'migration này cố ý KHÔNG tự đổi chúng thành Takeaway vì làm thế là sửa sai chứng từ tiền.',
            con_lai;
    END IF;
END $$;

-- Các cột giao hàng của V29/V30 CỐ Ý không bị DROP.
--
-- Migration chỉ mở rộng, không co lại: một cột đã tồn tại mà bị xoá là đường một chiều, còn để
-- nguyên thì không tốn gì. Hai cột NOT NULL trong nhóm đó (delivery_fee, cod_accepted) đều có
-- DEFAULT nên INSERT không nhắc tới chúng vẫn chạy. Java đã thôi ánh xạ chúng ở OrderEntity.
