export type CheckoutValidationFields = {
    email: string;
    first_name: string;
    last_name: string;
    address: string;
    city: string;
    country: string | null;
    payment_method: string | null | undefined;
};

const checkoutEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const normalizeCheckoutEmail = (email: string): string => email.trim();

export const validateCheckoutEmail = (email: string): string | null => {
    const normalizedEmail = normalizeCheckoutEmail(email);

    if (!normalizedEmail) return "Email is required";
    if (!checkoutEmailPattern.test(normalizedEmail)) return "Invalid email format";

    return null;
};

export const validateCheckoutForm = (fields: CheckoutValidationFields): string[] => {
    const errors: string[] = [];
    const emailError = validateCheckoutEmail(fields.email);

    if (emailError) errors.push(emailError);
    if (!fields.first_name.trim()) errors.push("First name is required");
    if (!fields.last_name.trim()) errors.push("Last name is required");
    if (!fields.address.trim()) errors.push("Shipping address is required");
    if (!fields.city.trim()) errors.push("City is required");
    if (!fields.country?.trim()) errors.push("Country is required");
    if (!fields.payment_method) errors.push("Please select a payment method");

    return errors;
};
