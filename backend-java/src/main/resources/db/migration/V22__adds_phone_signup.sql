-- Đăng ký bằng số điện thoại đã xác minh bằng OTP.
--
-- Vì sao đổi: điểm thưởng vốn tính theo SỐ ĐIỆN THOẠI, còn tài khoản trước đây định danh bằng
-- email — hai khoá khác nhau cho cùng một người, nên lúc nào cũng phải có một bước nối. Cho khách
-- đăng ký thẳng bằng số thì hai khoá thành một, và bước nối biến mất với người dùng đường này.
--
-- Bước nối KHÔNG biến mất hoàn toàn: khách vào bằng Google vẫn phải nối số, vì Google trả email
-- chứ không trả số điện thoại.
--
-- OTP là thứ giữ cho việc này an toàn. Nếu số điện thoại là danh tính đăng nhập mà không có xác
-- minh, thì bước đăng ký CHÍNH LÀ bước chiếm số: gõ số của khách quen là lấy trọn điểm của họ và
-- khoá luôn chủ thật ra ngoài. Xác minh chạy đúng một lần lúc đăng ký; đăng nhập về sau dùng mật
-- khẩu, nên mỗi khách chỉ tốn một tin nhắn cả đời.

-- Khách đăng ký bằng số thì KHÔNG có email. Nhân viên và quản trị viên vẫn dùng email, nên cột ở
-- lại — chỉ thôi bắt buộc.
ALTER TABLE public.users ALTER COLUMN email DROP NOT NULL;

-- Chỉ mục cũ là UNIQUE trên toàn cột. PostgreSQL coi nhiều NULL là khác nhau nên vẫn chạy được,
-- nhưng ghi rõ điều kiện để ý định không phụ thuộc vào một chi tiết của phương ngữ — cùng lý lẽ
-- đã dùng cho `ux_users_phone_number` ở V9.
DROP INDEX IF EXISTS "IX_users_email";

CREATE UNIQUE INDEX ux_users_email
    ON public.users (email)
    WHERE email IS NOT NULL;

-- Mỗi hàng phải định danh được bằng ÍT NHẤT một thứ. Không email, không số, không Google là một
-- hàng không ai đăng nhập nổi và không đường nào tạo ra nó ngoài lỗi lập trình — bắt cơ sở dữ liệu
-- nói ra ngay lúc ghi.
ALTER TABLE public.users ADD CONSTRAINT ck_users_co_dinh_danh
    CHECK (email IS NOT NULL OR phone_number IS NOT NULL OR google_sub IS NOT NULL);
