import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";

export type EvidenceFile = {
    id: number;
    uploadedBy: string;
    originalFilename: string;
    mimeType: "image/jpeg" | "image/png" | "application/pdf";
    byteSize: number;
    sha256: string;
    content: Buffer;
    createdAt: string;
};
export type EvidenceRecord = Omit<EvidenceFile, "createdAt" | "id">;
export type EvidenceUpload = { buffer: Buffer; mimetype: string; size: number; originalname: string };

type Queryable = { query: (sql: string, values: unknown[], callback: (error: Error | null, rows: unknown) => void) => unknown };
type QueryResult = { insertId?: number };

const query = <T>(sql: string, values: unknown[] = []): Promise<T> => new Promise((resolve, reject) => {
    (pool as unknown as Queryable).query(sql, values, (error, rows) => error ? reject(error) : resolve(rows as T));
});

export type EvidenceRepositoryPort = {
    insert(record: EvidenceRecord): Promise<{ id: number; sha256: string }>;
    findById(id: number): Promise<EvidenceFile | null>;
};

@Injectable()
export class EvidenceRepository implements EvidenceRepositoryPort {
    async insert(record: EvidenceRecord): Promise<{ id: number; sha256: string }> {
        const result = await query<QueryResult>(
            `INSERT INTO financial_evidence (uploaded_by, original_filename, mime_type, byte_size, sha256, content, created_at)
             VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
            [record.uploadedBy, record.originalFilename, record.mimeType, record.byteSize, record.sha256, record.content],
        );
        if (!Number.isSafeInteger(Number(result.insertId)) || Number(result.insertId) < 1) throw new Error("Evidence insert did not return an identifier");
        return { id: Number(result.insertId), sha256: record.sha256 };
    }

    async findById(id: number): Promise<EvidenceFile | null> {
        const rows = await query<Record<string, unknown>[]>(
            `SELECT id, uploaded_by, original_filename, mime_type, byte_size, sha256, content,
                    DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS created_at
             FROM financial_evidence WHERE id = ? LIMIT 1`, [id],
        );
        const row = rows[0];
        if (!row) return null;
        return {
            id: Number(row.id), uploadedBy: String(row.uploaded_by), originalFilename: String(row.original_filename),
            mimeType: String(row.mime_type) as EvidenceFile["mimeType"], byteSize: Number(row.byte_size),
            sha256: String(row.sha256), content: Buffer.from(row.content as Uint8Array), createdAt: String(row.created_at),
        };
    }
}
