-- Đăng nhập bằng Google — hạ rào cản tạo tài khoản cho khách tích điểm.
--
-- Vì sao cần: tài khoản hiện chỉ tạo được bằng email + mật khẩu. Khách ngồi trong quán ăn, muốn
-- tích điểm, phải gõ email rồi nghĩ ra một mật khẩu và gõ lại lần nữa. Rào cản đó chính là thứ
-- quyết định có ai đăng ký hay không, và nó không đổi lại được gì: chúng ta không hề xác minh
-- email đó có thật.
--
-- Google KHÔNG thay thế bước nối số điện thoại. Nó chứng minh khách sở hữu một TÀI KHOẢN GOOGLE,
-- không nói gì về việc khách có sở hữu số điện thoại kia hay không — nên `loyalty_link_codes`
-- (V20) và luật LOYALTY_PHONE_ALREADY_MEMBER giữ nguyên vai trò.

-- Định danh Google, ổn định vĩnh viễn cho một tài khoản. KHÔNG dùng email làm khoá nối: người
-- dùng đổi được email của tài khoản Google, còn `sub` thì không đổi.
ALTER TABLE public.users ADD COLUMN google_sub varchar(64);

CREATE UNIQUE INDEX ux_users_google_sub
    ON public.users (google_sub)
    WHERE google_sub IS NOT NULL;

-- Khách vào bằng Google thì KHÔNG có mật khẩu, nên cột phải cho phép NULL.
--
-- Cách khác là sinh một mật khẩu ngẫu nhiên không ai biết để giữ NOT NULL. Đã cân nhắc và bỏ:
-- nó nói dối lược đồ. Ai đọc bảng này sẽ tưởng khách có mật khẩu, và mọi đoạn mã sau này đọc
-- `password_hash` đều phải đoán xem giá trị đó là thật hay là rác.
--
-- Đánh đổi: `UserService.validateCredentials` từ nay phải tự chặn hàng không có mật khẩu. Nếu
-- quên, `PasswordHasher.verifyPassword` gọi `passwordHash.split(...)` sẽ ném NPE → 500, trong khi
-- email lạ trả 401. Chênh lệch đó đủ để dò ra email nào đã đăng ký — đúng thứ javadoc của
-- `validateCredentials` nói phải tránh.
ALTER TABLE public.users ALTER COLUMN password_hash DROP NOT NULL;

-- Mỗi hàng phải vào được bằng ÍT NHẤT một đường. Một tài khoản không mật khẩu lẫn không Google là
-- tài khoản không ai đăng nhập được, và nó chỉ sinh ra từ lỗi lập trình — bắt cơ sở dữ liệu nói
-- ra ngay lúc ghi, thay vì để khách phát hiện hộ khi không đăng nhập nổi.
ALTER TABLE public.users ADD CONSTRAINT ck_users_co_duong_dang_nhap
    CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL);
