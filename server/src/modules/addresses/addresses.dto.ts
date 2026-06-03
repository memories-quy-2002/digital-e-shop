export type CreateAddressInput = {
    label?: string;
    recipientName?: string;
    recipient_name?: string;
    phoneNumber?: string;
    phone_number?: string;
    addressLine?: string;
    address_line?: string;
    address?: string;
    city?: string;
    country?: string;
    isDefault?: boolean | number;
    is_default?: boolean | number;
};

export type UpdateAddressInput = CreateAddressInput;
