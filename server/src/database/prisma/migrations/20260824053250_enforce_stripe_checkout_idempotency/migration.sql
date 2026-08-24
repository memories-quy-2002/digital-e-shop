-- Prevent concurrent/retried Stripe checkout.session.completed events from
-- creating more than one order for the same Checkout Session.
ALTER TABLE orders
    ADD UNIQUE KEY uq_orders_stripe_checkout_session (stripe_checkout_session_id);
