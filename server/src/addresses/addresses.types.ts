import type { CreateAddressInput } from "./addresses.dto";

export type CustomerAddressInput = CreateAddressInput;

export type CustomerAddressRow = {
    id: number;
    user_id: string;
    label: string;
    recipient_name?: string | null;
    phone_number?: string | null;
    address_line: string;
    city?: string | null;
    country?: string | null;
    is_default?: number | boolean;
    created_at?: string;
    updated_at?: string;
};
