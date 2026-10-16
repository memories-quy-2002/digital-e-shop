export const parseJson = <T>(value: string | object): T => typeof value === "string" ? JSON.parse(value) : value as T;
