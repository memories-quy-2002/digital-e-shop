declare global {
    namespace Express {
        interface User {
            id?: string;
            role?: string;
            [key: string]: unknown;
        }

        interface Request {
            user?: User;
            file?: {
                buffer: Buffer;
                originalname?: string;
                size?: number;
            };
        }
    }
}

export {};
