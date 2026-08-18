-- Hạn chế #10: per-OrderItem timing sample. Recorded once, the moment an item transitions to
-- Ready (not overwritten on the later Ready -> Served move), so `ready_at - created_at` is a
-- real historical "time to ready" sample instead of being lost the moment the item is served.
ALTER TABLE order_items ADD COLUMN ready_at timestamptz;
