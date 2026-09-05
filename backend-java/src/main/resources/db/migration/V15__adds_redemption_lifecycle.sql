-- Vòng đời của phiếu đã đổi.
--
-- Từ V10 tới nay `loyalty_redemptions` là bảng CHỈ GHI: không một câu truy vấn nào đọc nó ngoài
-- việc tra `idempotency_key`. Hệ quả không phải chuyện thẩm mỹ — một phiếu tặng món đổi ra rồi
-- KHÔNG có trạng thái "đã dùng", nên khách chìa lại màn hình cũ ở lần ghé sau thì nhân viên không
-- có cách nào biết phiếu đó đã phát rồi. Quán mất món, và không có dấu vết nào để đối chiếu.
--
-- `honoured_at` NULL nghĩa là phiếu còn dùng được. Dùng cột thời điểm thay cho cột boolean vì câu
-- hỏi thật của quầy luôn kèm thời gian ("phiếu này phát lúc nào, ai phát"), và một cột boolean sẽ
-- lập tức phải đi kèm một cột thời điểm nữa.
ALTER TABLE public.loyalty_redemptions
    ADD COLUMN honoured_at timestamp with time zone,
    ADD COLUMN honoured_by character varying(50) REFERENCES public.users (id);

-- Ai phát thì phải có lúc phát, và ngược lại. Hai cột rời nhau sẽ âm thầm cho ra những dòng nửa
-- vời mà không câu truy vấn nào ở trên phát hiện được.
ALTER TABLE public.loyalty_redemptions
    ADD CONSTRAINT ck_loyalty_redemption_honoured
        CHECK ((honoured_at IS NULL AND honoured_by IS NULL)
            OR (honoured_at IS NOT NULL AND honoured_by IS NOT NULL));

-- Quầy hỏi đúng một câu: "số này còn phiếu nào chưa dùng". Chỉ đánh chỉ mục phần chưa dùng —
-- phiếu đã phát thì nằm lại vĩnh viễn và không bao giờ xuất hiện trong câu hỏi đó.
CREATE INDEX ix_loyalty_redemption_chua_dung
    ON public.loyalty_redemptions (member_id, created_at)
    WHERE honoured_at IS NULL;
