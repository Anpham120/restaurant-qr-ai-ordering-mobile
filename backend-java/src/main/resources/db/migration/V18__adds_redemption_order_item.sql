-- Dòng đơn nào ứng với lần đổi nào.
--
-- V17 cho phép hoàn khi huỷ CẢ đơn, tra theo `order_code`. Nhưng huỷ một MÓN thì mã đơn không đủ:
-- một đơn có thể mang hai món tặng từ hai lần đổi khác nhau, và huỷ một món mà hoàn cả hai là trả
-- cho khách số điểm họ chưa mất.
--
-- Chỉ ưu đãi tặng món mới có dòng đơn. Ưu đãi giảm tiền để trống — nó bám vào hoá đơn chứ không
-- vào món nào, nên huỷ một món không được đụng tới nó.
ALTER TABLE public.loyalty_redemptions
    ADD COLUMN order_item_id character varying(50);

CREATE INDEX ix_loyalty_redemption_theo_dong_don
    ON public.loyalty_redemptions (order_item_id)
    WHERE order_item_id IS NOT NULL;
