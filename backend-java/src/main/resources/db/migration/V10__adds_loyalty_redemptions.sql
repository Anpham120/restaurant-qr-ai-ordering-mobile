-- Sổ ghi việc đổi điểm lấy ưu đãi (§9.10 M3 mục 10, #34).
--
-- Vì sao cần cả một BẢNG chứ không chỉ trừ số điểm đi: không có sổ thì điểm biến mất mà không ai
-- đối chiếu được. Khách nói "tôi mất 200 điểm mà chưa nhận gì", quầy không có gì để tra, và hệ
-- thống cũng không phân biệt được giữa một lần đổi thật và một lỗi trừ nhầm.
--
-- `reward_name` lưu BẢN SAO tên ưu đãi tại thời điểm đổi, không chỉ khoá ngoại. Quán đổi tên hay
-- ngừng một ưu đãi là chuyện thường; sổ phải kể đúng thứ khách đã nhận LÚC ĐÓ, không phải thứ
-- khoá ngoại trỏ tới hôm nay. Cùng lý do với việc hoá đơn lưu tên món.
--
-- `points_spent` cũng lưu tại thời điểm đổi, vì `loyalty_rewards.points_required` có thể đổi.
CREATE TABLE public.loyalty_redemptions (
    id              character varying(50) PRIMARY KEY,
    member_id       character varying(50) NOT NULL REFERENCES public.loyalty_members (id),
    reward_id       character varying(50) NOT NULL REFERENCES public.loyalty_rewards (id),
    reward_name     character varying(200) NOT NULL,
    points_spent    integer NOT NULL,
    idempotency_key character varying(100) NOT NULL,
    created_at      timestamp with time zone NOT NULL
);

-- KHOÁ CHỐNG TIÊU HAI LẦN, ở tầng cơ sở dữ liệu.
--
-- Bấm hai lần lúc mạng chập chờn là chuyện thường, và ở đây nó tiêu điểm thật của khách. Ràng
-- buộc UNIQUE khiến lần chèn thứ hai thất bại ngay cả khi hai request chạy song song trên hai
-- tiến trình — thứ mà một phép kiểm "đã tồn tại chưa" ở tầng ứng dụng không bảo đảm được.
CREATE UNIQUE INDEX ux_loyalty_redemptions_idempotency_key
    ON public.loyalty_redemptions (idempotency_key);

CREATE INDEX ix_loyalty_redemptions_member_created
    ON public.loyalty_redemptions (member_id, created_at DESC);
