import { randomUUID } from "node:crypto";

export const GUEST_CART_COOKIE = "digitalEGuestCartId";
export const GUEST_CART_TTL_DAYS = 30;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isGuestCartId = (value: unknown): value is string =>
    typeof value === "string" && UUID_PATTERN.test(value);

export const createGuestCartId = () => randomUUID();
