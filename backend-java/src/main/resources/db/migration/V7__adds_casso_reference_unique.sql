-- Hạn chế #3: Casso retries a webhook up to 17 times in 24h until it gets a 200, so the same bank
-- transaction WILL arrive more than once. This partial unique index makes the database itself the
-- source of idempotency — a replayed reference cannot insert a second ledger row.
--
-- Partial (WHERE provider = 'Casso') on purpose: provider_transaction_id is already used by the
-- VietQR request rows to hold the transfer content ("CMC ORD-1001"), which is not a Casso
-- reference and must not be constrained by this index. Same conditional-unique-index technique the
-- baseline schema already uses for UX_table_sessions_active_restaurant_table.
CREATE UNIQUE INDEX "UX_payment_transactions_casso_reference"
    ON payment_transactions (provider_transaction_id)
    WHERE provider = 'Casso';
