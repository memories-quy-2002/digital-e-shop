export type UploadedFile = {
    buffer: Buffer;
};

export type UploadRequestFile = UploadedFile & {
    originalname?: string;
    size?: number;
};
