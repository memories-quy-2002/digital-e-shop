export type CreateReviewInput = {
    uid: string;
    pid: number;
    rating: number;
    comment?: string;
    reviewText?: string;
};
