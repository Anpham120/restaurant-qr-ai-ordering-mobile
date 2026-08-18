-- Optimistic concurrency for Payments (issue #10): two staff confirming/failing the same payment
-- concurrently must not both commit. Also the guard issue #12 builds on, where the Casso webhook
-- and a manual counter confirmation can race for the same payment.
ALTER TABLE payments ADD COLUMN version bigint NOT NULL DEFAULT 0;
