-- Phiếu đi vào đơn nào, và chỗ cho lần "phát" không do người nào bấm.
--
-- V15 giả định chỉ có MỘT cách phiếu bị tiêu: nhân viên bấm "đã phát". Nay có cách thứ hai —
-- khách đổi phiếu tặng món ngay tại bàn, hệ thống gắn món vào đơn đang mở với đơn giá 0đ, bếp
-- nhận và làm. Khi đó phiếu đã được tiêu xong mà KHÔNG có nhân viên nào đứng ra phát.
--
-- Ràng buộc cũ đòi `honoured_at` và `honoured_by` cùng có hoặc cùng không, nên lần tiêu kiểu này
-- không ghi được. Bất biến THẬT nhỏ hơn thế: không thể có người phát mà không có lúc phát. Chiều
-- ngược lại hợp lệ và mang nghĩa riêng — `honoured_by` NULL nghĩa là hệ thống tự gắn.
ALTER TABLE public.loyalty_redemptions
    DROP CONSTRAINT ck_loyalty_redemption_honoured;

ALTER TABLE public.loyalty_redemptions
    ADD CONSTRAINT ck_loyalty_redemption_honoured
        CHECK (honoured_by IS NULL OR honoured_at IS NOT NULL);

-- Đơn mà phiếu này đã đi vào. Dùng MÃ đơn chứ không phải khoá chính, cùng lý do với
-- `OrderLoyaltyPort`: mã đơn là thứ khách và nhân viên đọc được, khoá chính là chi tiết lưu trữ
-- của module Orders.
--
-- Không đặt khoá ngoại sang `orders`: một dòng sổ phải kể đúng chuyện đã xảy ra kể cả khi đơn bị
-- xoá về sau, cùng lý do với việc bảng này lưu `reward_name` thay vì chỉ trỏ khoá ngoại.
ALTER TABLE public.loyalty_redemptions
    ADD COLUMN order_code character varying(50);
