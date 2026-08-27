-- Mã nối số ở quầy — mảnh cuối để khách quen CŨ lấy lại được hồ sơ của mình.
--
-- Vấn đề: hồ sơ tích điểm sinh ra ở quầy, khoá là số điện thoại, và nó có trước khi khách cài app.
-- Khi khách tải app rồi nối chính số của mình, `MyLoyaltyService.linkPhone` từ chối với
-- LOYALTY_PHONE_ALREADY_MEMBER — đúng, vì không có bước xác minh nào thì gõ số người khác là cướp
-- điểm của họ. Nhưng câu "nhờ nhân viên tại quầy nối hộ" trỏ tới một màn hình chưa tồn tại, nên
-- mọi khách quen sẵn có đều bị khoá ngoài.
--
-- Thay cho OTP, không tốn tiền tin nhắn: app hiện một mã sáu chữ số, khách ĐỌC cho nhân viên,
-- nhân viên gõ vào màn quầy. Thứ được xác minh không phải "người này cầm SIM" mà "người này đang
-- mở app ngay trước mặt nhân viên" — với vài chục nghìn đồng điểm ở một quán ăn, đó là mức tương
-- xứng.
CREATE TABLE public.loyalty_link_codes (
    code       character varying(10)    PRIMARY KEY,
    user_id    character varying(50)    NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    created_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    -- Dùng một lần. Không có cột này thì một mã đọc lỡ trước mặt người khác còn nối được mãi.
    used_at    timestamp with time zone,
    used_by    character varying(50)    REFERENCES public.users (id),

    CONSTRAINT ck_link_code_used
        CHECK ((used_at IS NULL AND used_by IS NULL) OR (used_at IS NOT NULL AND used_by IS NOT NULL))
);

-- Mỗi tài khoản chỉ giữ MỘT mã còn hiệu lực. Xin mã mới thì mã cũ bị xoá — hai mã cùng sống nghĩa
-- là một mã khách tưởng đã hết hạn vẫn nối được.
CREATE INDEX ix_link_code_user ON public.loyalty_link_codes (user_id);

-- Dọn mã đã chết. Chỉ đánh chỉ mục phần còn sống.
CREATE INDEX ix_link_code_con_song
    ON public.loyalty_link_codes (expires_at)
    WHERE used_at IS NULL;
