-- Ảnh món chuyển từ PNG 1536px sang WebP 800px.
--
-- Vì sao cần một migration MỚI thay vì sửa V2: V2 là migration ĐÃ CHẠY trên mọi cơ sở dữ liệu đang
-- có dữ liệu. Flyway lưu checksum của từng migration đã áp dụng, nên sửa nội dung V2 sẽ khiến những
-- cơ sở dữ liệu đó TỪ CHỐI KHỞI ĐỘNG. Cách sửa trông "gọn hơn" ở đây là cách làm hỏng đúng những
-- môi trường có dữ liệu thật, trong khi máy lập trình vẫn chạy tốt vì nó tạo mới từ đầu.
--
-- Số đo trước khi đổi: 91 ảnh PNG 1536×1024, ~2,5 MB mỗi ảnh, tổng 212,7 MB. Sau: WebP 800px
-- chất lượng 82, tổng 6,3 MB — nhỏ hơn 34 lần. Đây là hệ thống khách mở bằng ĐIỆN THOẠI QUA 4G,
-- và một thẻ món hiển thị rộng khoảng 300px đang tải ảnh 1536px.
--
-- Chỉ đổi phần đuôi tệp, giữ nguyên tên: `replace` chỉ chạm '.png' ở cuối chuỗi vì mọi đường dẫn
-- đều có dạng '/menu-images/<tên>.png'.
UPDATE public.menu_items
SET image_url = replace(image_url, '.png', '.webp'),
    updated_at = now()
WHERE image_url LIKE '/menu-images/%.png';
