export type BlobHealthCheckQuery = {
    cleanup?: "true" | "false";
};

export type BlobUploadResponse = {
    ok: boolean;
    url: string;
    path: string;
    size?: number;
    msg: string;
};
