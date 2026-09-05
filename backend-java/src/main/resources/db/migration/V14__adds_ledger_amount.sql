-- Số TIỀN của mỗi lần tích, bên cạnh số ĐIỂM.
--
-- Tách khỏi V13 vì V13 đã chạy trên cơ sở dữ liệu phát triển; sửa một migration đã chạy sẽ làm
-- lệch checksum của Flyway và chặn mọi lần khởi động sau đó.
--
-- Vì sao cần: hạng thành viên xét theo chi tiêu 12 THÁNG, nên `loyalty_members.spend_12m` phải
-- GIẢM được khi một hoá đơn cũ rơi ra khỏi cửa sổ. Luồng thanh toán chỉ biết cộng vào. Việc trừ
-- ra là của tác vụ xét hạng hằng tháng, và nó cần biết từng hoá đơn đáng bao nhiêu tiền, ngày nào.
--
-- `delta` (điểm) không thay được cho việc này: hệ số theo hạng làm cùng một số tiền sinh ra số
-- điểm khác nhau, nên cộng ngược từ điểm ra tiền sẽ sai đúng bằng hệ số.
ALTER TABLE public.loyalty_point_ledger
    ADD COLUMN amount_vnd numeric(12, 2);

-- Chỉ dòng ACCRUE mới mang số tiền; dòng REDEEM/EXPIRE/REVERSE không ứng với hoá đơn nào.
ALTER TABLE public.loyalty_point_ledger
    ADD CONSTRAINT ck_loyalty_ledger_amount
        CHECK ((reason = 'ACCRUE' AND amount_vnd IS NOT NULL AND amount_vnd >= 0)
            OR (reason <> 'ACCRUE' AND amount_vnd IS NULL));
