-- Số điện thoại gắn với tài khoản khách, để app tra được điểm thưởng của CHÍNH mình (§9.10 M1
-- mục 3, #27).
--
-- Vì sao cần cột này: `loyalty_members` khoá theo `phone_number`, còn `users` trước đây không có
-- gì nối sang. Không có cột này thì cách duy nhất để app tra điểm là nhận số điện thoại làm tham
-- số — tức mở lại đúng lỗ hổng mà `LoyaltyController` cố ý chặn: ai gọi được cũng đếm được số nào
-- là khách và tiêu bao nhiêu.
--
-- NULLABLE: phần lớn tài khoản không có số, và tuyệt đại đa số khách vẫn là khách vãng lai không
-- có tài khoản. Bắt buộc nhập số lúc đăng ký sẽ đổi luồng đăng ký hiện có, thứ không ai yêu cầu.
--
-- UNIQUE nhưng chỉ trên hàng có giá trị (partial index): hai tài khoản cùng trỏ vào một hồ sơ
-- tích điểm nghĩa là hai người cùng đọc và cùng tiêu một số điểm. Ràng buộc UNIQUE thường sẽ coi
-- nhiều NULL là khác nhau ở PostgreSQL nên vẫn chạy được, nhưng ghi rõ `WHERE phone_number IS NOT
-- NULL` để ý định không phụ thuộc vào một chi tiết của phương ngữ.
ALTER TABLE public.users ADD COLUMN phone_number varchar(20);

CREATE UNIQUE INDEX ux_users_phone_number
    ON public.users (phone_number)
    WHERE phone_number IS NOT NULL;
