-- Xoá toàn bộ dữ liệu GIAO DỊCH (đơn hàng, thanh toán, phiên bàn, chat, ca quầy),
-- GIỮ NGUYÊN dữ liệu nền (thực đơn, bàn, người dùng, khuyến mãi, ưu đãi, tri thức AI).
--
-- Dùng khi chuyển sang bản Java và muốn bắt đầu lại từ số 0 mà không phải dựng lại schema.
--
-- CẢNH BÁO — đọc trước khi chạy:
--   * Thao tác này KHÔNG HOÀN TÁC ĐƯỢC. Không có bản sao nào được tạo tự động.
--   * TUYỆT ĐỐI không chạy trên VPS chung của nhóm. Cơ sở dữ liệu đó đang phục vụ điểm môn
--     INFO2005 của 4 người khác (kế hoạch §8.1). Script này chỉ dành cho máy cá nhân.
--   * Kiểm lại mình đang nối vào đâu trước khi gõ Enter:
--       SELECT current_database(), inet_server_addr(), inet_server_port();
--
-- Cách chạy (ví dụ với stack cục bộ):
--   docker exec -i <postgres-container> psql -U <user> -d <db> < scripts/db/reset-demo-data.sql
--
-- Muốn xem sẽ xoá bao nhiêu dòng TRƯỚC khi xoá: chạy scripts/db/count-demo-data.sql.

BEGIN;

-- Một giao dịch duy nhất: hoặc sạch hết, hoặc không đụng gì. Xoá nửa chừng sẽ để lại đơn không
-- có món, hoặc thanh toán trỏ vào đơn đã biến mất — tệ hơn là không xoá.

-- Thứ tự theo khoá ngoại, con trước cha.

-- Chat (phụ thuộc chat_sessions)
DELETE FROM chat_feedback;
DELETE FROM chat_recommendations;
DELETE FROM chat_session_facts;
DELETE FROM chat_messages;
DELETE FROM chat_sessions;

-- Quầy thu ngân
DELETE FROM counter_shift_transactions;
DELETE FROM counter_shifts;

-- Thanh toán (payment_transactions -> payments -> table_invoices)
DELETE FROM payment_transactions;
DELETE FROM payments;
DELETE FROM table_invoices;

-- Đơn hàng
DELETE FROM order_status_history;
DELETE FROM order_items;
DELETE FROM orders;

-- Phiên bàn và giỏ hàng
DELETE FROM table_session_cart_items;
DELETE FROM table_sessions;

-- Điểm thành viên: xoá vì điểm sinh ra TỪ các đơn demo vừa xoá. Giữ lại sẽ thành điểm không có
-- đơn nào giải thích, và bảng loyalty_rewards (danh mục ưu đãi) thì vẫn còn nguyên.
-- Muốn giữ khách thật thì bỏ comment dòng dưới và xoá dòng DELETE.
-- (giữ lại) -- DELETE FROM loyalty_members;
DELETE FROM loyalty_members;

-- Mã đơn quay lại ORD-1001 cho lần demo kế tiếp.
ALTER SEQUENCE orders_order_code_seq RESTART WITH 1001;

COMMIT;

-- KHÔNG bị đụng tới:
--   categories, menu_items, restaurant_tables  (thực đơn và bàn — seed V2)
--   users                                       (tài khoản nhân viên)
--   promotions, loyalty_rewards                 (mã giảm giá, danh mục ưu đãi)
--   knowledge_entries, menu_item_knowledge      (tri thức cho dịch vụ AI)
