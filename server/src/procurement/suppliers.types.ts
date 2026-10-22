export type AdminListQuery = {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    supplierId?: number;
};

export type PageResult<T> = {
    items: T[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
};

export type Supplier = {
    id: number;
    code: string;
    name: string;
    contactName: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    notes: string | null;
    active: boolean;
    version: number;
    createdAt: string;
    updatedAt: string;
};

export type SupplierFields = {
    code: string;
    name: string;
    contactName?: string;
    email?: string;
    phone?: string;
    address?: string;
    notes?: string;
};

export type CreateSupplierInput = SupplierFields;
export type UpdateSupplierInput = Partial<SupplierFields> & { version: number };
export type SupplierActionInput = { version: number; reason: string };

export type SupplierRow = Record<string, unknown>;
