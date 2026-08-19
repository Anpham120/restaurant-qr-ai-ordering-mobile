-- Đếm số dòng mà reset-demo-data.sql SẼ xoá, và số dòng nó giữ lại.
-- Chỉ đọc, không sửa gì. Chạy cái này trước để biết mình sắp xoá bao nhiêu.
--
--   docker exec -i <postgres-container> psql -U <user> -d <db> < scripts/db/count-demo-data.sql

SELECT 'SẼ XOÁ' AS nhom, 'orders' AS bang, count(*) AS so_dong FROM orders
UNION ALL SELECT 'SẼ XOÁ', 'order_items', count(*) FROM order_items
UNION ALL SELECT 'SẼ XOÁ', 'order_status_history', count(*) FROM order_status_history
UNION ALL SELECT 'SẼ XOÁ', 'payments', count(*) FROM payments
UNION ALL SELECT 'SẼ XOÁ', 'payment_transactions', count(*) FROM payment_transactions
UNION ALL SELECT 'SẼ XOÁ', 'table_invoices', count(*) FROM table_invoices
UNION ALL SELECT 'SẼ XOÁ', 'table_sessions', count(*) FROM table_sessions
UNION ALL SELECT 'SẼ XOÁ', 'table_session_cart_items', count(*) FROM table_session_cart_items
UNION ALL SELECT 'SẼ XOÁ', 'chat_sessions', count(*) FROM chat_sessions
UNION ALL SELECT 'SẼ XOÁ', 'chat_messages', count(*) FROM chat_messages
UNION ALL SELECT 'SẼ XOÁ', 'counter_shifts', count(*) FROM counter_shifts
UNION ALL SELECT 'SẼ XOÁ', 'counter_shift_transactions', count(*) FROM counter_shift_transactions
UNION ALL SELECT 'SẼ XOÁ', 'loyalty_members', count(*) FROM loyalty_members
UNION ALL SELECT 'giữ lại', 'menu_items', count(*) FROM menu_items
UNION ALL SELECT 'giữ lại', 'categories', count(*) FROM categories
UNION ALL SELECT 'giữ lại', 'restaurant_tables', count(*) FROM restaurant_tables
UNION ALL SELECT 'giữ lại', 'users', count(*) FROM users
UNION ALL SELECT 'giữ lại', 'promotions', count(*) FROM promotions
UNION ALL SELECT 'giữ lại', 'loyalty_rewards', count(*) FROM loyalty_rewards
ORDER BY nhom DESC, bang;
