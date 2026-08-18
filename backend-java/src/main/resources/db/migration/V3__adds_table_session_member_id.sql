-- Optional link from a table session to the authenticated customer who opened/rejoined it
-- (mobile app full-parity, docs/pm/KE_HOACH_HOC_KY_2026-2.md §9.4). Null for the existing
-- anonymous QR flow — this column is purely additive and does not change that behavior.
ALTER TABLE table_sessions ADD COLUMN member_id character varying(50);
