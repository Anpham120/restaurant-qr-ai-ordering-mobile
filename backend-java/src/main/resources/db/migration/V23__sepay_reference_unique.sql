-- Chốt chặn ghi trùng chuyển sang nhãn SePay.
--
-- V7 tạo chỉ mục duy nhất chỉ áp cho `provider = 'Casso'`. Nay đối soát ghi nhãn 'SePay', nên nếu
-- để nguyên thì giao dịch SePay KHÔNG được chỉ mục nào bảo vệ — và SePay gửi lại tới 17 lần trong
-- 24 giờ cho tới khi nhận được 200. Một lần gửi lại lọt qua là ghi nhận số tiền đó lần thứ hai.
--
-- Phủ CẢ HAI nhãn thay vì đổi tên nhãn cũ: hàng cũ thật sự đến từ Casso, sửa nhãn của chúng là
-- viết lại lịch sử tiền. Mã tham chiếu ngân hàng vốn không trùng nhau giữa hai nhà cung cấp, và
-- nếu có trùng thì đó cũng chính là một giao dịch — chặn là đúng.
DROP INDEX IF EXISTS "UX_payment_transactions_casso_reference";

CREATE UNIQUE INDEX ux_payment_transactions_bank_reference
    ON payment_transactions (provider_transaction_id)
    WHERE provider IN ('Casso', 'SePay');
