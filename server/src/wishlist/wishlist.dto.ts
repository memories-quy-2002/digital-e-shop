export type WishlistAddInput = {
    uid: string;
    pid: number | string;
};

export type WishlistDeleteInput = {
    uid: string;
    pid: number | string;
};

export type WishlistBulkDeleteInput = {
    uid: string;
    productIds: Array<number | string>;
};
