import { Injectable } from "@nestjs/common";
import type { DbError, InsertResult, UpdateResult } from "#src/shared/interfaces/domain";
import { SupportTicketRepository } from "./support.repository";
import type { CreateSupportTicketInput, SupportTicket, UpdateSupportTicketInput } from "./support.types";

const domainError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });

@Injectable()
export class SupportTicketService {
    constructor(private readonly repository: SupportTicketRepository) {}

    createTicket(userId: string, input: CreateSupportTicketInput): Promise<SupportTicket> {
        return new Promise((resolve, reject) => {
            this.repository.create(userId, input, (error: DbError | null, result: InsertResult) => {
                if (error) return reject(error);
                if (!result?.insertId) return reject(domainError("The selected order does not belong to this account.", 404));
                this.repository.findById(result.insertId, (findError: DbError | null, rows: SupportTicket[]) => {
                    if (findError) return reject(findError);
                    if (!rows[0]) return reject(domainError("Support ticket was not created.", 500));
                    resolve(rows[0]);
                });
            });
        });
    }

    listTickets(userId: string, isAdmin: boolean, status?: string): Promise<SupportTicket[]> {
        return new Promise((resolve, reject) => {
            const callback = (error: DbError | null, rows: SupportTicket[]) => error ? reject(error) : resolve(rows || []);
            if (isAdmin) this.repository.findAll(status, callback);
            else this.repository.findByUser(userId, status, callback);
        });
    }

    updateTicket(id: number, input: UpdateSupportTicketInput): Promise<SupportTicket> {
        return new Promise((resolve, reject) => {
            this.repository.update(id, input, (error: DbError | null, result: UpdateResult) => {
                if (error) return reject(error);
                if (!result?.affectedRows) return reject(domainError("Support ticket not found.", 404));
                this.repository.findById(id, (findError: DbError | null, rows: SupportTicket[]) => {
                    if (findError) return reject(findError);
                    if (!rows[0]) return reject(domainError("Support ticket not found.", 404));
                    resolve(rows[0]);
                });
            });
        });
    }
}
