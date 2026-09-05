-- Bỏ hoàn toàn trợ lý AI khỏi hệ thống (#179).
--
-- Nhóm không ai chuyên về AI kỳ này, và dịch vụ chưa từng chạy ở bất kỳ môi trường nào — nó nằm
-- sau compose profile vì máy chủ cũ (`qemu64`, không AVX2) không dựng nổi `torch`. Kỳ này tập
-- trung vào hạ tầng DevOps và nghiệp vụ đặt món. Lý do đầy đủ ở issue.
--
-- Bảy bảng dưới đây chỉ phục vụ trợ lý. Sau khi gỡ `com.cmc.restaurant.chat` thì không mô-đun nào
-- còn đọc chúng, nên để lại là để lại một góc chết mà mọi lần đọc lược đồ về sau đều phải hỏi
-- "cái này còn dùng không".
--
-- THỨ TỰ theo khoá ngoại: bảng con trước, `chat_sessions` sau cùng.
--
-- Dữ liệu mất theo là lịch sử hội thoại. Không có gì trong đó cần cho việc gọi món, thanh toán hay
-- tích điểm — `orders`, `table_invoices` và `loyalty_*` độc lập hoàn toàn.
DROP TABLE IF EXISTS public.chat_feedback;
DROP TABLE IF EXISTS public.chat_recommendations;
DROP TABLE IF EXISTS public.chat_session_facts;
DROP TABLE IF EXISTS public.chat_messages;
DROP TABLE IF EXISTS public.chat_sessions;

-- Kho tri thức cho phần truy hồi. Cùng lý do: không ai đọc nữa.
DROP TABLE IF EXISTS public.menu_item_knowledge;
DROP TABLE IF EXISTS public.knowledge_entries;
