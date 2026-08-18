--
-- PostgreSQL database dump
--


-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id character varying(50) NOT NULL,
    name character varying(200) NOT NULL,
    display_order integer NOT NULL,
    is_active boolean NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: chat_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_feedback (
    id character varying(50) NOT NULL,
    chat_session_id character varying(50) NOT NULL,
    message_id character varying(50) NOT NULL,
    rating character varying(10) NOT NULL,
    reason character varying(1000),
    created_at timestamp with time zone NOT NULL
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id character varying(50) NOT NULL,
    chat_session_id character varying(50) NOT NULL,
    role character varying(20) NOT NULL,
    content text NOT NULL,
    suggested_cart_actions_json jsonb,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: chat_recommendations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_recommendations (
    id character varying(50) NOT NULL,
    chat_session_id character varying(50) NOT NULL,
    menu_item_id character varying(50) NOT NULL,
    status character varying(30) NOT NULL,
    turn_id character varying(50),
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: chat_session_facts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_session_facts (
    id character varying(50) NOT NULL,
    chat_session_id character varying(50) NOT NULL,
    kind character varying(50) NOT NULL,
    value character varying(500) NOT NULL,
    source_turn_id character varying(50),
    confidence double precision NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: chat_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_sessions (
    id character varying(50) NOT NULL,
    restaurant_table_id character varying(50),
    table_code character varying(20),
    order_id character varying(50),
    is_closed boolean NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    table_session_id character varying(50),
    rolling_summary text,
    constraints_json jsonb,
    memory_version character varying(50) DEFAULT 'v1'::character varying NOT NULL,
    referenced_menu_item_ids_json jsonb
);


--
-- Name: counter_shift_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.counter_shift_transactions (
    id character varying(50) NOT NULL,
    counter_shift_id character varying(50) NOT NULL,
    type character varying(20) NOT NULL,
    amount numeric(18,2) NOT NULL,
    table_session_id character varying(50),
    invoice_code character varying(30),
    reason_code character varying(50),
    note character varying(500),
    created_by_user_id character varying(50) NOT NULL,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: counter_shifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.counter_shifts (
    id character varying(50) NOT NULL,
    opened_by_user_id character varying(50) NOT NULL,
    closed_by_user_id character varying(50),
    status character varying(20) NOT NULL,
    opening_cash_balance numeric(18,2) NOT NULL,
    expected_cash_total numeric(18,2) NOT NULL,
    actual_cash_total numeric(18,2),
    cash_variance numeric(18,2),
    close_note character varying(500),
    opened_at timestamp with time zone NOT NULL,
    closed_at timestamp with time zone,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: knowledge_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_entries (
    id character varying(50) NOT NULL,
    title character varying(300) NOT NULL,
    content text NOT NULL,
    source_type character varying(50) NOT NULL,
    menu_item_id character varying(50),
    tags text[] NOT NULL,
    embedding jsonb,
    is_active boolean NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: loyalty_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loyalty_members (
    id character varying(50) NOT NULL,
    phone_number character varying(20) NOT NULL,
    full_name character varying(200),
    points integer NOT NULL,
    lifetime_spend numeric(18,2) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: loyalty_rewards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loyalty_rewards (
    id character varying(50) NOT NULL,
    name character varying(200) NOT NULL,
    description character varying(1000),
    points_required integer NOT NULL,
    is_active boolean NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: menu_item_knowledge; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_item_knowledge (
    id character varying(50) NOT NULL,
    menu_item_id character varying(50) NOT NULL,
    ingredients text,
    allergens character varying(500),
    spice_level integer NOT NULL,
    calories_estimate integer,
    flavor_profile character varying(500),
    dietary_tags character varying(500),
    cooking_method character varying(200),
    serving_size_people integer,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: menu_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_items (
    id character varying(50) NOT NULL,
    category_id character varying(50) NOT NULL,
    name character varying(300) NOT NULL,
    description character varying(1000) NOT NULL,
    price numeric(18,2) NOT NULL,
    image_url character varying(500),
    is_available boolean NOT NULL,
    tags text[] NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id character varying(50) NOT NULL,
    order_id character varying(50) NOT NULL,
    menu_item_id character varying(50) NOT NULL,
    menu_item_name character varying(300) NOT NULL,
    unit_price numeric(18,2) NOT NULL,
    quantity integer NOT NULL,
    note character varying(500),
    status character varying(20) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: order_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_status_history (
    id character varying(50) NOT NULL,
    order_id character varying(50) NOT NULL,
    from_status character varying(20),
    to_status character varying(20) NOT NULL,
    source character varying(20) NOT NULL,
    changed_by_user_id character varying(50),
    changed_by_role character varying(20),
    note character varying(500),
    created_at timestamp with time zone NOT NULL
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id character varying(50) NOT NULL,
    order_code character varying(50) NOT NULL,
    order_type character varying(20) NOT NULL,
    status character varying(20) NOT NULL,
    restaurant_table_id character varying(50),
    table_code character varying(20),
    pickup_customer_name character varying(200),
    pickup_customer_phone character varying(20),
    pickup_requested_at timestamp with time zone,
    subtotal_amount numeric(18,2) NOT NULL,
    total_amount numeric(18,2) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    customer_access_token character varying(64),
    table_session_id character varying(50),
    customer_phone_number character varying(20),
    discount_amount numeric(18,2) DEFAULT 0.0 NOT NULL,
    promotion_code character varying(50),
    promotion_id character varying(50),
    idempotency_key character varying(100),
    request_fingerprint character varying(64)
);


--
-- Name: orders_order_code_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.orders_order_code_seq
    START WITH 1001
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payment_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_transactions (
    id character varying(50) NOT NULL,
    payment_id character varying(50) NOT NULL,
    method character varying(20) NOT NULL,
    status character varying(20) NOT NULL,
    amount numeric(18,2) NOT NULL,
    provider character varying(50) NOT NULL,
    provider_transaction_id character varying(200),
    note character varying(500),
    created_at timestamp with time zone NOT NULL,
    idempotency_key character varying(100),
    request_fingerprint character varying(64)
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id character varying(50) NOT NULL,
    order_id character varying(50),
    method character varying(20) NOT NULL,
    status character varying(20) NOT NULL,
    amount numeric(18,2) NOT NULL,
    provider_transaction_id character varying(200),
    created_at timestamp with time zone NOT NULL,
    paid_at timestamp with time zone,
    updated_at timestamp with time zone NOT NULL,
    table_invoice_id character varying(50),
    CONSTRAINT "CK_payments_single_target" CHECK (((order_id IS NULL) <> (table_invoice_id IS NULL)))
);


--
-- Name: promotions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotions (
    id character varying(50) NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(200) NOT NULL,
    description character varying(1000),
    type character varying(20) NOT NULL,
    discount_value numeric(18,2) NOT NULL,
    min_order_amount numeric(18,2),
    max_discount_amount numeric(18,2),
    is_flash_sale boolean NOT NULL,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    is_active boolean NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: restaurant_tables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.restaurant_tables (
    id character varying(50) NOT NULL,
    table_code character varying(20) NOT NULL,
    display_name character varying(100) NOT NULL,
    is_active boolean NOT NULL,
    qr_token character varying(100),
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: table_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.table_invoices (
    id character varying(50) NOT NULL,
    invoice_code character varying(30) NOT NULL,
    table_session_id character varying(50) NOT NULL,
    status character varying(20) NOT NULL,
    subtotal_amount numeric(18,2) NOT NULL,
    discount_amount numeric(18,2) NOT NULL,
    total_amount numeric(18,2) NOT NULL,
    promotion_id character varying(50),
    promotion_code character varying(50),
    customer_phone_number character varying(30),
    method character varying(20) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: table_session_cart_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.table_session_cart_items (
    id character varying(50) NOT NULL,
    table_session_id character varying(50) NOT NULL,
    menu_item_id character varying(50) NOT NULL,
    quantity integer NOT NULL,
    note character varying(500),
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: table_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.table_sessions (
    id character varying(50) NOT NULL,
    restaurant_table_id character varying(50),
    table_code character varying(20),
    qr_token character varying(100),
    order_type character varying(20) NOT NULL,
    status character varying(20) NOT NULL,
    opened_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    closed_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id character varying(50) NOT NULL,
    email character varying(160) NOT NULL,
    full_name character varying(120) NOT NULL,
    password_hash character varying(512) NOT NULL,
    role character varying(30) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    failed_login_count integer DEFAULT 0 NOT NULL,
    lockout_end_at timestamp with time zone
);


--
-- Name: categories PK_categories; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT "PK_categories" PRIMARY KEY (id);


--
-- Name: chat_feedback PK_chat_feedback; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_feedback
    ADD CONSTRAINT "PK_chat_feedback" PRIMARY KEY (id);


--
-- Name: chat_messages PK_chat_messages; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT "PK_chat_messages" PRIMARY KEY (id);


--
-- Name: chat_recommendations PK_chat_recommendations; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_recommendations
    ADD CONSTRAINT "PK_chat_recommendations" PRIMARY KEY (id);


--
-- Name: chat_session_facts PK_chat_session_facts; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_session_facts
    ADD CONSTRAINT "PK_chat_session_facts" PRIMARY KEY (id);


--
-- Name: chat_sessions PK_chat_sessions; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_sessions
    ADD CONSTRAINT "PK_chat_sessions" PRIMARY KEY (id);


--
-- Name: counter_shift_transactions PK_counter_shift_transactions; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counter_shift_transactions
    ADD CONSTRAINT "PK_counter_shift_transactions" PRIMARY KEY (id);


--
-- Name: counter_shifts PK_counter_shifts; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counter_shifts
    ADD CONSTRAINT "PK_counter_shifts" PRIMARY KEY (id);


--
-- Name: knowledge_entries PK_knowledge_entries; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_entries
    ADD CONSTRAINT "PK_knowledge_entries" PRIMARY KEY (id);


--
-- Name: loyalty_members PK_loyalty_members; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_members
    ADD CONSTRAINT "PK_loyalty_members" PRIMARY KEY (id);


--
-- Name: loyalty_rewards PK_loyalty_rewards; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_rewards
    ADD CONSTRAINT "PK_loyalty_rewards" PRIMARY KEY (id);


--
-- Name: menu_item_knowledge PK_menu_item_knowledge; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_knowledge
    ADD CONSTRAINT "PK_menu_item_knowledge" PRIMARY KEY (id);


--
-- Name: menu_items PK_menu_items; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT "PK_menu_items" PRIMARY KEY (id);


--
-- Name: order_items PK_order_items; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT "PK_order_items" PRIMARY KEY (id);


--
-- Name: order_status_history PK_order_status_history; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT "PK_order_status_history" PRIMARY KEY (id);


--
-- Name: orders PK_orders; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT "PK_orders" PRIMARY KEY (id);


--
-- Name: payment_transactions PK_payment_transactions; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT "PK_payment_transactions" PRIMARY KEY (id);


--
-- Name: payments PK_payments; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT "PK_payments" PRIMARY KEY (id);


--
-- Name: promotions PK_promotions; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotions
    ADD CONSTRAINT "PK_promotions" PRIMARY KEY (id);


--
-- Name: restaurant_tables PK_restaurant_tables; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restaurant_tables
    ADD CONSTRAINT "PK_restaurant_tables" PRIMARY KEY (id);


--
-- Name: table_invoices PK_table_invoices; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_invoices
    ADD CONSTRAINT "PK_table_invoices" PRIMARY KEY (id);


--
-- Name: table_session_cart_items PK_table_session_cart_items; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_session_cart_items
    ADD CONSTRAINT "PK_table_session_cart_items" PRIMARY KEY (id);


--
-- Name: table_sessions PK_table_sessions; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_sessions
    ADD CONSTRAINT "PK_table_sessions" PRIMARY KEY (id);


--
-- Name: users PK_users; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "PK_users" PRIMARY KEY (id);


--
-- Name: IX_categories_display_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_categories_display_order" ON public.categories USING btree (display_order);


--
-- Name: IX_categories_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_categories_is_active" ON public.categories USING btree (is_active);


--
-- Name: IX_chat_feedback_chat_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_chat_feedback_chat_session_id" ON public.chat_feedback USING btree (chat_session_id);


--
-- Name: IX_chat_feedback_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_chat_feedback_message_id" ON public.chat_feedback USING btree (message_id);


--
-- Name: IX_chat_messages_chat_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_chat_messages_chat_session_id" ON public.chat_messages USING btree (chat_session_id);


--
-- Name: IX_chat_recommendations_chat_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_chat_recommendations_chat_session_id" ON public.chat_recommendations USING btree (chat_session_id);


--
-- Name: IX_chat_recommendations_chat_session_id_menu_item_id_status; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IX_chat_recommendations_chat_session_id_menu_item_id_status" ON public.chat_recommendations USING btree (chat_session_id, menu_item_id, status);


--
-- Name: IX_chat_session_facts_chat_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_chat_session_facts_chat_session_id" ON public.chat_session_facts USING btree (chat_session_id);


--
-- Name: IX_chat_session_facts_chat_session_id_kind_value; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IX_chat_session_facts_chat_session_id_kind_value" ON public.chat_session_facts USING btree (chat_session_id, kind, value);


--
-- Name: IX_chat_sessions_is_closed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_chat_sessions_is_closed" ON public.chat_sessions USING btree (is_closed);


--
-- Name: IX_chat_sessions_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_chat_sessions_order_id" ON public.chat_sessions USING btree (order_id);


--
-- Name: IX_chat_sessions_restaurant_table_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_chat_sessions_restaurant_table_id" ON public.chat_sessions USING btree (restaurant_table_id);


--
-- Name: IX_chat_sessions_table_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_chat_sessions_table_session_id" ON public.chat_sessions USING btree (table_session_id);


--
-- Name: IX_counter_shift_transactions_counter_shift_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_counter_shift_transactions_counter_shift_id" ON public.counter_shift_transactions USING btree (counter_shift_id);


--
-- Name: IX_counter_shift_transactions_table_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_counter_shift_transactions_table_session_id" ON public.counter_shift_transactions USING btree (table_session_id);


--
-- Name: IX_counter_shifts_closed_by_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_counter_shifts_closed_by_user_id" ON public.counter_shifts USING btree (closed_by_user_id);


--
-- Name: IX_counter_shifts_opened_by_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_counter_shifts_opened_by_user_id" ON public.counter_shifts USING btree (opened_by_user_id);


--
-- Name: IX_counter_shifts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_counter_shifts_status" ON public.counter_shifts USING btree (status);


--
-- Name: IX_knowledge_entries_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_knowledge_entries_is_active" ON public.knowledge_entries USING btree (is_active);


--
-- Name: IX_knowledge_entries_menu_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_knowledge_entries_menu_item_id" ON public.knowledge_entries USING btree (menu_item_id);


--
-- Name: IX_loyalty_members_phone_number; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IX_loyalty_members_phone_number" ON public.loyalty_members USING btree (phone_number);


--
-- Name: IX_loyalty_rewards_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_loyalty_rewards_is_active" ON public.loyalty_rewards USING btree (is_active);


--
-- Name: IX_loyalty_rewards_points_required; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_loyalty_rewards_points_required" ON public.loyalty_rewards USING btree (points_required);


--
-- Name: IX_menu_item_knowledge_menu_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IX_menu_item_knowledge_menu_item_id" ON public.menu_item_knowledge USING btree (menu_item_id);


--
-- Name: IX_menu_items_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_menu_items_category_id" ON public.menu_items USING btree (category_id);


--
-- Name: IX_menu_items_is_available; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_menu_items_is_available" ON public.menu_items USING btree (is_available);


--
-- Name: IX_order_items_menu_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_order_items_menu_item_id" ON public.order_items USING btree (menu_item_id);


--
-- Name: IX_order_items_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_order_items_order_id" ON public.order_items USING btree (order_id);


--
-- Name: IX_order_status_history_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_order_status_history_created_at" ON public.order_status_history USING btree (created_at);


--
-- Name: IX_order_status_history_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_order_status_history_order_id" ON public.order_status_history USING btree (order_id);


--
-- Name: IX_orders_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_orders_created_at" ON public.orders USING btree (created_at);


--
-- Name: IX_orders_idempotency_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IX_orders_idempotency_key" ON public.orders USING btree (idempotency_key);


--
-- Name: IX_orders_order_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IX_orders_order_code" ON public.orders USING btree (order_code);


--
-- Name: IX_orders_promotion_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_orders_promotion_id" ON public.orders USING btree (promotion_id);


--
-- Name: IX_orders_restaurant_table_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_orders_restaurant_table_id" ON public.orders USING btree (restaurant_table_id);


--
-- Name: IX_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_orders_status" ON public.orders USING btree (status);


--
-- Name: IX_orders_table_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_orders_table_session_id" ON public.orders USING btree (table_session_id);


--
-- Name: IX_payment_transactions_idempotency_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IX_payment_transactions_idempotency_key" ON public.payment_transactions USING btree (idempotency_key);


--
-- Name: IX_payment_transactions_payment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_payment_transactions_payment_id" ON public.payment_transactions USING btree (payment_id);


--
-- Name: IX_payment_transactions_provider_transaction_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_payment_transactions_provider_transaction_id" ON public.payment_transactions USING btree (provider_transaction_id);


--
-- Name: IX_payment_transactions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_payment_transactions_status" ON public.payment_transactions USING btree (status);


--
-- Name: IX_payments_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IX_payments_order_id" ON public.payments USING btree (order_id);


--
-- Name: IX_payments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_payments_status" ON public.payments USING btree (status);


--
-- Name: IX_payments_table_invoice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IX_payments_table_invoice_id" ON public.payments USING btree (table_invoice_id);


--
-- Name: IX_promotions_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IX_promotions_code" ON public.promotions USING btree (code);


--
-- Name: IX_promotions_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_promotions_is_active" ON public.promotions USING btree (is_active);


--
-- Name: IX_restaurant_tables_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_restaurant_tables_is_active" ON public.restaurant_tables USING btree (is_active);


--
-- Name: IX_restaurant_tables_qr_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IX_restaurant_tables_qr_token" ON public.restaurant_tables USING btree (qr_token);


--
-- Name: IX_restaurant_tables_table_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IX_restaurant_tables_table_code" ON public.restaurant_tables USING btree (table_code);


--
-- Name: IX_table_invoices_invoice_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IX_table_invoices_invoice_code" ON public.table_invoices USING btree (invoice_code);


--
-- Name: IX_table_invoices_promotion_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_table_invoices_promotion_id" ON public.table_invoices USING btree (promotion_id);


--
-- Name: IX_table_invoices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_table_invoices_status" ON public.table_invoices USING btree (status);


--
-- Name: IX_table_invoices_table_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IX_table_invoices_table_session_id" ON public.table_invoices USING btree (table_session_id);


--
-- Name: IX_table_session_cart_items_menu_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_table_session_cart_items_menu_item_id" ON public.table_session_cart_items USING btree (menu_item_id);


--
-- Name: IX_table_session_cart_items_table_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_table_session_cart_items_table_session_id" ON public.table_session_cart_items USING btree (table_session_id);


--
-- Name: IX_table_session_cart_items_table_session_id_menu_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IX_table_session_cart_items_table_session_id_menu_item_id" ON public.table_session_cart_items USING btree (table_session_id, menu_item_id);


--
-- Name: IX_table_sessions_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_table_sessions_expires_at" ON public.table_sessions USING btree (expires_at);


--
-- Name: IX_table_sessions_qr_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_table_sessions_qr_token" ON public.table_sessions USING btree (qr_token);


--
-- Name: IX_table_sessions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_table_sessions_status" ON public.table_sessions USING btree (status);


--
-- Name: IX_table_sessions_table_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_table_sessions_table_code" ON public.table_sessions USING btree (table_code);


--
-- Name: IX_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IX_users_email" ON public.users USING btree (email);


--
-- Name: UX_table_sessions_active_restaurant_table; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "UX_table_sessions_active_restaurant_table" ON public.table_sessions USING btree (restaurant_table_id) WHERE (((status)::text = 'Open'::text) AND (closed_at IS NULL));


--
-- Name: chat_feedback FK_chat_feedback_chat_messages_message_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_feedback
    ADD CONSTRAINT "FK_chat_feedback_chat_messages_message_id" FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON DELETE CASCADE;


--
-- Name: chat_feedback FK_chat_feedback_chat_sessions_chat_session_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_feedback
    ADD CONSTRAINT "FK_chat_feedback_chat_sessions_chat_session_id" FOREIGN KEY (chat_session_id) REFERENCES public.chat_sessions(id) ON DELETE CASCADE;


--
-- Name: chat_messages FK_chat_messages_chat_sessions_chat_session_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT "FK_chat_messages_chat_sessions_chat_session_id" FOREIGN KEY (chat_session_id) REFERENCES public.chat_sessions(id) ON DELETE CASCADE;


--
-- Name: chat_recommendations FK_chat_recommendations_chat_sessions_chat_session_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_recommendations
    ADD CONSTRAINT "FK_chat_recommendations_chat_sessions_chat_session_id" FOREIGN KEY (chat_session_id) REFERENCES public.chat_sessions(id) ON DELETE CASCADE;


--
-- Name: chat_session_facts FK_chat_session_facts_chat_sessions_chat_session_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_session_facts
    ADD CONSTRAINT "FK_chat_session_facts_chat_sessions_chat_session_id" FOREIGN KEY (chat_session_id) REFERENCES public.chat_sessions(id) ON DELETE CASCADE;


--
-- Name: chat_sessions FK_chat_sessions_orders_order_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_sessions
    ADD CONSTRAINT "FK_chat_sessions_orders_order_id" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: chat_sessions FK_chat_sessions_restaurant_tables_restaurant_table_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_sessions
    ADD CONSTRAINT "FK_chat_sessions_restaurant_tables_restaurant_table_id" FOREIGN KEY (restaurant_table_id) REFERENCES public.restaurant_tables(id) ON DELETE SET NULL;


--
-- Name: counter_shift_transactions FK_counter_shift_transactions_counter_shifts_counter_shift_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counter_shift_transactions
    ADD CONSTRAINT "FK_counter_shift_transactions_counter_shifts_counter_shift_id" FOREIGN KEY (counter_shift_id) REFERENCES public.counter_shifts(id) ON DELETE CASCADE;


--
-- Name: counter_shift_transactions FK_counter_shift_transactions_users_created_by_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counter_shift_transactions
    ADD CONSTRAINT "FK_counter_shift_transactions_users_created_by_user_id" FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: counter_shifts FK_counter_shifts_users_closed_by_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counter_shifts
    ADD CONSTRAINT "FK_counter_shifts_users_closed_by_user_id" FOREIGN KEY (closed_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: counter_shifts FK_counter_shifts_users_opened_by_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counter_shifts
    ADD CONSTRAINT "FK_counter_shifts_users_opened_by_user_id" FOREIGN KEY (opened_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: knowledge_entries FK_knowledge_entries_menu_items_menu_item_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_entries
    ADD CONSTRAINT "FK_knowledge_entries_menu_items_menu_item_id" FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE SET NULL;


--
-- Name: menu_item_knowledge FK_menu_item_knowledge_menu_items_menu_item_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_knowledge
    ADD CONSTRAINT "FK_menu_item_knowledge_menu_items_menu_item_id" FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;


--
-- Name: menu_items FK_menu_items_categories_category_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT "FK_menu_items_categories_category_id" FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE RESTRICT;


--
-- Name: order_items FK_order_items_menu_items_menu_item_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT "FK_order_items_menu_items_menu_item_id" FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE SET NULL;


--
-- Name: order_items FK_order_items_orders_order_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT "FK_order_items_orders_order_id" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_status_history FK_order_status_history_orders_order_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT "FK_order_status_history_orders_order_id" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: orders FK_orders_promotions_promotion_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT "FK_orders_promotions_promotion_id" FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) ON DELETE SET NULL;


--
-- Name: orders FK_orders_restaurant_tables_restaurant_table_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT "FK_orders_restaurant_tables_restaurant_table_id" FOREIGN KEY (restaurant_table_id) REFERENCES public.restaurant_tables(id) ON DELETE SET NULL;


--
-- Name: orders FK_orders_table_sessions_table_session_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT "FK_orders_table_sessions_table_session_id" FOREIGN KEY (table_session_id) REFERENCES public.table_sessions(id) ON DELETE SET NULL;


--
-- Name: payment_transactions FK_payment_transactions_payments_payment_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT "FK_payment_transactions_payments_payment_id" FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE;


--
-- Name: payments FK_payments_orders_order_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT "FK_payments_orders_order_id" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: payments FK_payments_table_invoices_table_invoice_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT "FK_payments_table_invoices_table_invoice_id" FOREIGN KEY (table_invoice_id) REFERENCES public.table_invoices(id) ON DELETE CASCADE;


--
-- Name: table_invoices FK_table_invoices_promotions_promotion_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_invoices
    ADD CONSTRAINT "FK_table_invoices_promotions_promotion_id" FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) ON DELETE SET NULL;


--
-- Name: table_invoices FK_table_invoices_table_sessions_table_session_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_invoices
    ADD CONSTRAINT "FK_table_invoices_table_sessions_table_session_id" FOREIGN KEY (table_session_id) REFERENCES public.table_sessions(id) ON DELETE CASCADE;


--
-- Name: table_session_cart_items FK_table_session_cart_items_menu_items_menu_item_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_session_cart_items
    ADD CONSTRAINT "FK_table_session_cart_items_menu_items_menu_item_id" FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE RESTRICT;


--
-- Name: table_session_cart_items FK_table_session_cart_items_table_sessions_table_session_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_session_cart_items
    ADD CONSTRAINT "FK_table_session_cart_items_table_sessions_table_session_id" FOREIGN KEY (table_session_id) REFERENCES public.table_sessions(id) ON DELETE CASCADE;


--
-- Name: table_sessions FK_table_sessions_restaurant_tables_restaurant_table_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_sessions
    ADD CONSTRAINT "FK_table_sessions_restaurant_tables_restaurant_table_id" FOREIGN KEY (restaurant_table_id) REFERENCES public.restaurant_tables(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--


