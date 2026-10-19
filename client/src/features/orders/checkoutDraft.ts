import type { PaymentMethod } from "./constants";
import type { DeliveryAddress } from "../shipping/types";

export type CheckoutFormDraft = {
    email: string;
    first_name: string;
    last_name: string;
    address: string;
    city: string;
    country: string | null;
    phone_number: string | null;
    payment_method: PaymentMethod;
};

export type CheckoutDraft = {
    formCheckout: CheckoutFormDraft;
    deliveryAddress: DeliveryAddress;
};

// Kept in memory only so cancelling the local simulator does not persist checkout PII.
let checkoutDraft: CheckoutDraft | null = null;

export const writeCheckoutDraft = (draft: CheckoutDraft) => {
    checkoutDraft = draft;
};

export const hasCheckoutDraft = () => checkoutDraft !== null;

export const takeCheckoutDraft = () => {
    const current = checkoutDraft;
    checkoutDraft = null;
    return current;
};

export const clearCheckoutDraft = () => {
    checkoutDraft = null;
};
