-- Độ trễ do BẾP TỰ KHAI, cộng vào ước lượng lên món (#142).
--
-- V11 cho công thức đọc được tải bếp từ hàng đợi đơn. Nhưng hàng đợi chỉ chứa thứ đã đi qua app.
-- Đầu bếp nghỉ ốm, hỏng lò, một đoàn đặt trước làm ở trong — bếp biết hết, hệ thống không thấy gì.
-- Bảng này là đường để bếp nói ra phần hệ thống không đo được.
--
-- MỘT DÒNG DUY NHẤT. Đây là trạng thái hiện tại của cái bếp, không phải nhật ký. CHECK (id = 1)
-- khiến việc chèn dòng thứ hai thất bại ngay tại CSDL, thay vì để hai dòng cùng tồn tại rồi ứng
-- dụng đọc nhầm dòng và không ai biết vì sao con số sai.

CREATE TABLE public.kitchen_delay (
    id            smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    delay_minutes integer     NOT NULL DEFAULT 0 CHECK (delay_minutes >= 0 AND delay_minutes <= 60),
    expires_at    timestamptz,
    updated_at    timestamptz NOT NULL DEFAULT now(),
    updated_by    text
);

-- Trần 60 phút nằm ở CSDL chứ không chỉ ở tầng ứng dụng, vì nó là một giới hạn nghiệp vụ chứ
-- không phải một quy tắc nhập liệu: khi bếp trễ hơn một tiếng thì câu trả lời trung thực là ngừng
-- nhận món, không phải hiện một con số to hơn cho khách đang ngồi chờ.

-- expires_at NULL nghĩa là không có độ trễ nào đang hiệu lực. Cột này để cờ TỰ HẾT HẠN khi đọc,
-- nên không cần job dọn nền — không có tiến trình nào phải chạy đúng giờ để hệ thống đúng.

INSERT INTO public.kitchen_delay (id, delay_minutes, expires_at, updated_by)
VALUES (1, 0, NULL, 'migration');

COMMENT ON TABLE  public.kitchen_delay          IS 'Độ trễ bếp tự khai; một dòng, id luôn bằng 1';
COMMENT ON COLUMN public.kitchen_delay.expires_at IS 'Hết hạn thì coi như delay_minutes = 0';
