-- Hoàn lại một lần đổi điểm khi đơn bị huỷ.
--
-- Trước cột này, huỷ một đơn có ưu đãi là khách mất trắng: món tặng đã gắn vào đơn thì biến mất
-- cùng đơn, khoản giảm không còn ý nghĩa, mà điểm thì đã trừ xong và không có đường nào trả lại.
-- Bếp làm nhầm một đơn rồi huỷ là chuyện xảy ra hằng ngày, nên đây không phải trường hợp hiếm.
--
-- Không xoá dòng đổi điểm: sổ phải kể đúng chuyện đã xảy ra, kể cả chuyện về sau bị hoàn. Đánh dấu
-- rồi loại khỏi các câu hỏi "còn dùng được không" là cách giữ được cả hai.
ALTER TABLE public.loyalty_redemptions
    ADD COLUMN reversed_at timestamp with time zone;

-- Tìm các lần đổi bám vào một đơn. Chỉ đánh chỉ mục dòng có gắn đơn — phiếu chưa gắn đơn nào
-- không bao giờ xuất hiện trong câu hỏi này.
CREATE INDEX ix_loyalty_redemption_theo_don
    ON public.loyalty_redemptions (order_code)
    WHERE order_code IS NOT NULL;
