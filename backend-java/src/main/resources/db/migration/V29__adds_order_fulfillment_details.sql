ALTER TABLE public.orders
    ADD COLUMN recipient_name varchar(200),
    ADD COLUMN recipient_phone varchar(30),
    ADD COLUMN delivery_address varchar(1000),
    ADD COLUMN delivery_note varchar(500),
    ADD COLUMN delivery_fee numeric(18,2) NOT NULL DEFAULT 0.00;

ALTER TABLE public.orders
    ADD CONSTRAINT ck_orders_delivery_fee_non_negative CHECK (delivery_fee >= 0);
