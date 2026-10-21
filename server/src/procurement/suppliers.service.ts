import { Injectable } from "@nestjs/common";
import { AppError } from "#src/core/errors/app-error";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { SuppliersRepository } from "./suppliers.repository";
import type { CreateSupplierInput, SupplierActionInput, UpdateSupplierInput } from "./suppliers.types";

const isDuplicate = (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ER_DUP_ENTRY");

@Injectable()
export class SuppliersService {
    constructor(private readonly repository: SuppliersRepository) {}

    list(query: { page: number; limit: number; search: string; status: string }) {
        return this.repository.list(query.page, query.limit, query.search, query.status);
    }

    async get(id: number) {
        const supplier = await this.repository.get(id);
        if (!supplier) throw new AppError("Supplier not found.", HTTP_STATUS.NOT_FOUND);
        return supplier;
    }

    async create(actorId: string, input: CreateSupplierInput) {
        if (!actorId) throw new AppError("A verified admin actor is required.", HTTP_STATUS.BAD_REQUEST);
        try { return await this.repository.create(actorId, input); }
        catch (error) {
            if (isDuplicate(error)) throw new AppError("Supplier code already exists.", HTTP_STATUS.CONFLICT, "SUPPLIER_CODE_CONFLICT");
            throw error;
        }
    }

    async update(actorId: string, id: number, input: UpdateSupplierInput) {
        try { return await this.repository.update(actorId, id, input); }
        catch (error) {
            if (isDuplicate(error)) throw new AppError("Supplier code already exists.", HTTP_STATUS.CONFLICT, "SUPPLIER_CODE_CONFLICT");
            throw error;
        }
    }

    archive(actorId: string, id: number, input: SupplierActionInput) {
        return this.repository.archive(actorId, id, input);
    }
}
