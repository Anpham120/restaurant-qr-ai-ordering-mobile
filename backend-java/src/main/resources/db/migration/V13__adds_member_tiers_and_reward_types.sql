-- Hạng thành viên, loại ưu đãi, và sổ cái điểm.
--
-- Ba việc trong một migration vì chúng chỉ có nghĩa cùng nhau: hạng quyết định hệ số tích, loại
-- ưu đãi quyết định quán chịu bao nhiêu, sổ cái là thứ duy nhất cho phép điểm hết hạn.

-- ── 1. HẠNG THÀNH VIÊN ───────────────────────────────────────────────────────────────────────
--
-- `spend_12m` là cột MỚI chứ không dùng lại `lifetime_spend` đã có. Khác biệt là toàn bộ vấn đề:
-- `lifetime_spend` chỉ cộng dồn và không bao giờ giảm, nên xếp hạng bằng nó thì một khách ghé
-- nhiều hồi 2024 rồi biến mất vẫn giữ hạng cao nhất vĩnh viễn — quán trả quyền lợi cho doanh thu
-- đã chết. `lifetime_spend` được GIỮ LẠI, nhưng chỉ để báo cáo.
--
-- `last_activity_at` ghi lần ghé gần nhất. KHÔNG phải mốc đếm hạn điểm — hạn tính theo từng lô
-- tích, xem cột `expires_at` của sổ điểm bên dưới. Hai cách khác nhau ở một điểm quan trọng: đếm
-- từ lần ghé cuối thì một khách ghé đều đặn tích được vô hạn và quán mang một khoản nợ điểm không
-- có trần; đếm theo lô thì mỗi điểm đều có ngày chết, và tổng nợ bị chặn bởi doanh thu 12 tháng.
ALTER TABLE public.loyalty_members
    ADD COLUMN tier             character varying(20)  NOT NULL DEFAULT 'BAC',
    ADD COLUMN spend_12m        numeric(18,2)          NOT NULL DEFAULT 0,
    ADD COLUMN last_activity_at timestamp with time zone;

ALTER TABLE public.loyalty_members
    ADD CONSTRAINT ck_loyalty_members_tier CHECK (tier IN ('BAC', 'VANG', 'KIM_CUONG'));

UPDATE public.loyalty_members SET last_activity_at = updated_at WHERE last_activity_at IS NULL;

-- ── 2. LOẠI ƯU ĐÃI ───────────────────────────────────────────────────────────────────────────
--
-- Trước đây bảng chỉ có tên và mô tả dạng chữ, nên máy không phân biệt được "tặng món" với "giảm
-- tiền". Khác biệt đó là tiền thật: một món bán 45.000đ có giá vốn khoảng 17.000đ, nên tặng món
-- rẻ hơn hẳn giảm cùng số tiền, ở cùng một mức khách cảm nhận.
ALTER TABLE public.loyalty_rewards
    ADD COLUMN reward_type     character varying(20) NOT NULL DEFAULT 'DISCOUNT',
    ADD COLUMN menu_item_id    character varying(50) REFERENCES public.menu_items (id),
    ADD COLUMN discount_amount numeric(18,2),
    ADD COLUMN min_tier        character varying(20) NOT NULL DEFAULT 'BAC';

-- Tắt ưu đãi nhập trước khi có các cột loại. Một ưu đãi mà hệ thống không biết phải trả cho
-- khách CÁI GÌ thì để đang bật là hứa một việc không thực hiện được: khách tiêu điểm thật rồi
-- nhận về không gì cả. Quản trị viên tạo lại bản đầy đủ là việc vài giây.
UPDATE public.loyalty_rewards SET is_active = false WHERE menu_item_id IS NULL AND discount_amount IS NULL;

ALTER TABLE public.loyalty_rewards
    ADD CONSTRAINT ck_loyalty_rewards_type CHECK (reward_type IN ('FREE_ITEM', 'DISCOUNT')),
    ADD CONSTRAINT ck_loyalty_rewards_min_tier CHECK (min_tier IN ('BAC', 'VANG', 'KIM_CUONG')),
    -- Mỗi loại phải mang đúng dữ liệu của nó. Thiếu ràng buộc này thì một ưu đãi FREE_ITEM không
    -- có `menu_item_id` sẽ nằm im trong bảng cho tới lúc khách bấm đổi và không nhận được gì.
    --
    -- Chỉ soi ưu đãi ĐANG BẬT. Bảng này có dữ liệu nhập lúc chạy từ trước khi có các cột trên, và
    -- không có cách nào đoán đúng bản ghi cũ là tặng món hay giảm tiền. Ép chúng vào một loại nào
    -- đó là bịa; khối dưới tắt chúng đi thay vì đoán. Ưu đãi đã tắt là vỏ rỗng vô hại, còn ưu đãi
    -- đang bật thì bắt buộc phải đủ dữ liệu để trả cho khách.
    ADD CONSTRAINT ck_loyalty_rewards_payload CHECK (
        is_active = false
        OR (reward_type = 'FREE_ITEM' AND menu_item_id IS NOT NULL AND discount_amount IS NULL)
        OR (reward_type = 'DISCOUNT' AND discount_amount IS NOT NULL AND menu_item_id IS NULL)
    );

-- ── 3. SỔ CÁI ĐIỂM ───────────────────────────────────────────────────────────────────────────
--
-- Muốn cho điểm hết hạn thì phải biết TỪNG LÔ điểm tích khi nào. Một con số tổng ở
-- `loyalty_members.points` không đủ: nó không nói được 200 điểm trong đó tích tháng nào.
--
-- `delta` âm là tiêu, dương là tích. Không xoá dòng nào — huỷ đơn thì ghi thêm một dòng âm, để
-- lịch sử còn đọc được ngược lại.
CREATE TABLE public.loyalty_point_ledger (
    id         character varying(50)  PRIMARY KEY,
    member_id  character varying(50)  NOT NULL REFERENCES public.loyalty_members (id),
    delta      integer                NOT NULL,
    reason     character varying(30)  NOT NULL,
    order_code character varying(50),
    expires_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_loyalty_ledger_reason
        CHECK (reason IN ('ACCRUE', 'REDEEM', 'EXPIRE', 'REVERSE'))
);

CREATE INDEX ix_loyalty_ledger_member_created
    ON public.loyalty_point_ledger (member_id, created_at DESC);

-- Tìm lô điểm sắp hết hạn. Chỉ dòng TÍCH mới có hạn, nên lọc luôn ở đây.
CREATE INDEX ix_loyalty_ledger_expiry
    ON public.loyalty_point_ledger (expires_at)
    WHERE expires_at IS NOT NULL;

-- ── 4. DANH MỤC ƯU ĐÃI ───────────────────────────────────────────────────────────────────────
--
-- Bảng `loyalty_rewards` có từ V1 nhưng chưa bao giờ có một bản ghi nào — chương trình đổi điểm
-- tồn tại trên giấy mà không có gì để đổi.
--
-- Điểm của ưu đãi tặng món đặt theo GIÁ BÁN (100đ mỗi điểm, đúng tỷ lệ đổi chung), vì đó là con
-- số khách cảm nhận. Quán chỉ chịu giá vốn — chênh lệch đó là lý do danh mục nghiêng về tặng món.
--
-- FAIL CLOSED: tra món theo TÊN và bắt lỗi nếu không thấy. Dùng `INSERT ... SELECT` trần thì một
-- tên món sai chỉ chèn 0 dòng, không báo gì, và ưu đãi biến mất im lặng khỏi danh mục.
DO $$
DECLARE
    ma_mon text;
    ten_mon text;
    diem integer;
    hang text;
    bo_uu_dai text[][] := ARRAY[
        ARRAY['Chè bưởi',       '350',  'BAC'],
        ARRAY['Trà đào cam sả', '450',  'BAC'],
        ARRAY['Gỏi cuốn chay',  '450',  'BAC'],
        ARRAY['Cơm bò lúc lắc', '950',  'VANG']
    ];
    i integer;
BEGIN
    FOR i IN 1 .. array_length(bo_uu_dai, 1) LOOP
        ten_mon := bo_uu_dai[i][1];
        diem    := bo_uu_dai[i][2]::integer;
        hang    := bo_uu_dai[i][3];

        SELECT id INTO ma_mon FROM public.menu_items WHERE name = ten_mon LIMIT 1;
        IF ma_mon IS NULL THEN
            RAISE EXCEPTION 'Khong tim thay mon "%" de tao uu dai doi diem', ten_mon;
        END IF;

        INSERT INTO public.loyalty_rewards
            (id, name, description, points_required, is_active,
             reward_type, menu_item_id, min_tier, created_at, updated_at)
        VALUES
            ('rw_free_' || replace(ma_mon, 'menu_', ''), ten_mon,
             'Tặng một phần ' || ten_mon || '.', diem, true,
             'FREE_ITEM', ma_mon, hang, now(), now());
    END LOOP;
END $$;

-- Giảm tiền: quán chịu đủ số tiền, nên chỉ để hai mốc và xếp SAU phần tặng món trên màn hình.
INSERT INTO public.loyalty_rewards
    (id, name, description, points_required, is_active,
     reward_type, discount_amount, min_tier, created_at, updated_at)
VALUES
    ('rw_disc_50',  'Giảm 50.000đ',  'Trừ thẳng 50.000đ vào hoá đơn.',  500,  true,
     'DISCOUNT', 50000,  'BAC', now(), now()),
    ('rw_disc_100', 'Giảm 100.000đ', 'Trừ thẳng 100.000đ vào hoá đơn.', 1000, true,
     'DISCOUNT', 100000, 'BAC', now(), now());
