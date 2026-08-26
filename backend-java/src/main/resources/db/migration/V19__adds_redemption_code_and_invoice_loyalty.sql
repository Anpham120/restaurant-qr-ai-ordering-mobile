-- Ưu đãi đổi bằng điểm trở thành một MÃ, và trừ ở cấp hoá đơn.
--
-- SỬA MỘT LỖI LẤY TIỀN CỦA KHÁCH. Trước migration này, đổi ưu đãi giảm tiền ghi vào
-- `orders.discount_amount`, trong khi `TableInvoiceService` tính lại tạm tính từ dòng món rồi chỉ
-- trừ `table_invoices.discount_amount` — nó KHÔNG BAO GIỜ đọc cấp đơn hàng. Đo thật: khách đổi
-- "Giảm 100.000đ", bị trừ 1000 điểm, hoá đơn vẫn thu đủ 760.000đ. Điểm mất, tiền không giảm.
--
-- Gốc của lỗi là hệ thống có HAI cấp giảm giá. Sửa bằng cách bỏ hẳn một cấp: mọi khoản giảm — mã
-- của quán và ưu đãi đổi điểm — đều ghi vào `table_invoices`, nơi tiền thật sự được chốt.

-- ── 1. Mã của lần đổi điểm ────────────────────────────────────────────────────────────────────
--
-- Ưu đãi đổi ra một mã ngắn thay vì bám sẵn vào một đơn. Đổi lấy được ba thứ:
--   * cùng một ô nhập với mã của quán — khách không phải hiểu hai khái niệm;
--   * hội viên gọi món trên web bằng máy người khác vẫn dùng được ưu đãi của mình;
--   * ưu đãi không chết theo một đơn cụ thể.
--
-- Mã là VẬT MANG QUYỀN: ai cầm mã thì dùng được. Đó là chủ ý — giống phiếu giấy — nhưng có nghĩa
-- mã phải khó đoán. Sinh từ bảng chữ không có ký tự dễ nhìn nhầm (bỏ O/0, I/1).
ALTER TABLE public.loyalty_redemptions
    ADD COLUMN code character varying(20);

-- Số tiền giảm CHỤP LẠI tại thời điểm đổi. Không đọc lại từ `loyalty_rewards` lúc dùng mã: quán
-- sửa ưu đãi từ 100.000đ xuống 50.000đ thì khách đã đổi trước đó vẫn phải được đúng thứ họ đã
-- trả điểm để lấy — cùng lý do với `reward_name` và `points_spent`.
ALTER TABLE public.loyalty_redemptions
    ADD COLUMN discount_amount numeric(18, 2);

CREATE UNIQUE INDEX ux_loyalty_redemption_code
    ON public.loyalty_redemptions (code)
    WHERE code IS NOT NULL;

-- ── 2. Chỗ ghi trên hoá đơn ───────────────────────────────────────────────────────────────────
--
-- `discount_amount` vẫn là TỔNG, để mọi câu truy vấn cũ không đổi nghĩa. Hai cột dưới là phần
-- tách ra, cần cho biên nhận: khách phải đọc được "mã quán −50.000, đổi điểm −100.000" chứ không
-- phải một con số gộp không giải thích được.
ALTER TABLE public.table_invoices
    ADD COLUMN loyalty_redemption_id character varying(50),
    ADD COLUMN loyalty_discount_amount numeric(18, 2);

-- Không đặt khoá ngoại sang `loyalty_redemptions`: hoá đơn là chứng từ, nó phải kể đúng chuyện đã
-- xảy ra kể cả khi bản ghi kia bị xoá về sau — cùng lý do với `reward_name` và `order_code`.
CREATE INDEX ix_table_invoice_loyalty_redemption
    ON public.table_invoices (loyalty_redemption_id)
    WHERE loyalty_redemption_id IS NOT NULL;

-- Hai cột đi cùng nhau hoặc cùng vắng. Rời nhau sẽ sinh ra hoá đơn ghi "có dùng ưu đãi" mà không
-- nói giảm bao nhiêu, hoặc ngược lại.
ALTER TABLE public.table_invoices
    ADD CONSTRAINT ck_table_invoice_loyalty
        CHECK ((loyalty_redemption_id IS NULL AND loyalty_discount_amount IS NULL)
            OR (loyalty_redemption_id IS NOT NULL AND loyalty_discount_amount IS NOT NULL));
