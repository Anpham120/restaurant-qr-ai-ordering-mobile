-- Tiền khách đưa và tiền thối, cho đường thanh toán tiền mặt tại quầy.
--
-- Vì sao LƯU chứ không chỉ tính rồi hiện: cuối ca `CounterShiftPanel` đối chiếu quỹ, và không có
-- số tiền THỰC NHẬN thì phần đối chiếu đó không đối chiếu được với cái gì. Chỉ có `amount` (số
-- tiền hoá đơn) thì mọi ca đều khớp hoàn hảo trên giấy trong khi ngăn kéo lệch.
--
-- Cho phép NULL: hoá đơn cũ không có số này, và thanh toán chuyển khoản thì khái niệm "tiền khách
-- đưa" không tồn tại. NULL nghĩa là "không áp dụng", khác hẳn 0 nghĩa là "khách đưa 0 đồng".
ALTER TABLE payment_transactions
    ADD COLUMN amount_tendered NUMERIC(12, 2),
    ADD COLUMN change_due NUMERIC(12, 2);
