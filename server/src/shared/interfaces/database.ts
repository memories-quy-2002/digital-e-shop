export type DbError = Error & {
    code?: string;
    sqlMessage?: string;
    statusCode?: number;
    details?: Record<string, unknown>;
};

export type QueryCallback<T = unknown> = (err?: DbError | null, results?: T, fields?: unknown) => void;

export type QueryParams = unknown[] | Record<string, unknown> | QueryCallback | undefined;

export type InsertResult = {
    insertId: number;
    affectedRows?: number;
};

export type UpdateResult = {
    affectedRows: number;
};

export type CountRow = {
    total: number;
};

export type IdNameRow = {
    id: number;
    name?: string;
};

export type LooseRecord = Record<string, unknown>;
