export type CustomerIdentity = {
    id: string;
    email: string;
    username: string;
    first_name: string | null;
    last_name: string | null;
    role: string;
    created_at: string;
    last_login: string;
};

export type CustomerAddress = {
    id: number;
    label: string;
    recipient_name: string | null;
    phone_number: string | null;
    address_line: string;
    city: string | null;
    country: string | null;
    is_default: boolean;
};

export type CustomerAddressPayload = {
    label: string;
    recipientName: string;
    phoneNumber: string;
    addressLine: string;
    city: string;
    country: string;
    isDefault: boolean;
};

export type CustomerNotification = {
    id: number;
    type: string;
    title: string;
    message: string;
    link: string | null;
    read_at: string | null;
    created_at: string;
    is_read: boolean;
};
