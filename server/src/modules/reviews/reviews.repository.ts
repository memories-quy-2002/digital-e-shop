import pool from "#/config/database.config";
const prisma = require("#/database/prisma/client");
import type { CountRow, QueryCallback, UpdateResult } from "#/shared/interfaces/domain";
import type { RatingSummaryRow, ReviewRow } from "./reviews.types";

const getReviewByUserAndProduct = (uid: string, pid: number, callback: QueryCallback<ReviewRow[]>) => {
    pool.query("SELECT id FROM reviews WHERE user_id = ? AND product_id = ? LIMIT 1", [uid, pid], callback);
};

const addReviewByUserId = (uid: string, pid: number, rating: number, reviewText: string, callback: QueryCallback<UpdateResult>) => {
    pool.query(
        "INSERT INTO reviews (user_id, product_id, rating, review_text, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())",
        [uid, pid, rating, reviewText],
        callback
    );
};

const updateReviewByUserAndProduct = (uid: string, pid: number, rating: number, reviewText: string, callback: QueryCallback<UpdateResult>) => {
    pool.query(
        "UPDATE reviews SET rating = ?, review_text = ?, created_at = UTC_TIMESTAMP() WHERE user_id = ? AND product_id = ?",
        [rating, reviewText, uid, pid],
        callback
    );
};

const toUtcIsoSecondString = (value: Date) => value.toISOString().replace(/\.\d{3}Z$/, ".000Z");

const getReviews = (pid: number, callback: QueryCallback<ReviewRow[]>) => {
    (async () => {
        const rows = await prisma.review.findMany({
            where: { productId: pid },
            include: { user: { select: { username: true } } },
            orderBy: { createdAt: "desc" },
        });

        const userIds = [...new Set(rows.map((row: { userId: string }) => row.userId))];
        const verifiedRows: Array<{ user_id: string }> = userIds.length
            ? await prisma.$queryRawUnsafe(
                `SELECT DISTINCT o.user_id
                 FROM orders o
                 JOIN order_items oi ON oi.order_id = o.id
                 WHERE oi.product_id = ?
                 AND o.status <> 2
                 AND o.user_id IN (${userIds.map(() => "?").join(",")})`,
                pid,
                ...userIds
            )
            : [];

        const verifiedSet = new Set((verifiedRows || []).map((entry: { user_id: string }) => entry.user_id));

        callback(
            null,
            rows.map(
                (row: { id: number; userId: string; rating: number; reviewText: string | null; createdAt: Date; user: { username: string | null } }) => ({
                    id: row.id,
                    user_id: row.userId,
                    username: row.user?.username ?? null,
                    rating: row.rating,
                    review_text: row.reviewText,
                    created_at: toUtcIsoSecondString(row.createdAt),
                    verified_purchase: verifiedSet.has(row.userId),
                })
            )
        );
    })().catch((error: Error) => callback(error));
};

const getReviewsPaginated = (pid: number, limit: number, offset: number, callback: QueryCallback<ReviewRow[]>) => {
    (async () => {
        const rows = await prisma.review.findMany({
            where: { productId: pid },
            include: { user: { select: { username: true } } },
            orderBy: { createdAt: "desc" },
            take: limit,
            skip: offset,
        });

        const userIds = [...new Set(rows.map((row: { userId: string }) => row.userId))];
        const verifiedRows: Array<{ user_id: string }> = userIds.length
            ? await prisma.$queryRawUnsafe(
                `SELECT DISTINCT o.user_id
                 FROM orders o
                 JOIN order_items oi ON oi.order_id = o.id
                 WHERE oi.product_id = ?
                 AND o.status <> 2
                 AND o.user_id IN (${userIds.map(() => "?").join(",")})`,
                pid,
                ...userIds
            )
            : [];

        const verifiedSet = new Set((verifiedRows || []).map((entry: { user_id: string }) => entry.user_id));

        callback(
            null,
            rows.map(
                (row: { id: number; userId: string; rating: number; reviewText: string | null; createdAt: Date; user: { username: string | null } }) => ({
                    id: row.id,
                    user_id: row.userId,
                    username: row.user?.username ?? null,
                    rating: row.rating,
                    review_text: row.reviewText,
                    created_at: toUtcIsoSecondString(row.createdAt),
                    verified_purchase: verifiedSet.has(row.userId),
                })
            )
        );
    })().catch((error: Error) => callback(error));
};

const getReviewsCount = (pid: number, callback: QueryCallback<CountRow[]>) => {
    (async () => {
        const total = await prisma.review.count({ where: { productId: pid } });
        callback(null, [{ total }]);
    })().catch((error: Error) => callback(error));
};

const getRatingSummary = (pid: number, callback: QueryCallback<RatingSummaryRow[]>) => {
    (async () => {
        const [total, averageAgg, grouped] = await Promise.all([
            prisma.review.count({ where: { productId: pid } }),
            prisma.review.aggregate({ where: { productId: pid }, _avg: { rating: true } }),
            prisma.review.groupBy({
                by: ["rating"],
                where: { productId: pid },
                _count: { _all: true },
            }),
        ]);

        const bucket = new Map<number, number>();
        for (const entry of grouped) {
            bucket.set(entry.rating, entry._count._all);
        }

        const average = Number((Number(averageAgg._avg.rating ?? 0)).toFixed(1));
        callback(null, [
            {
                total,
                average,
                five: bucket.get(5) ?? 0,
                four: bucket.get(4) ?? 0,
                three: bucket.get(3) ?? 0,
                two: bucket.get(2) ?? 0,
                one: bucket.get(1) ?? 0,
            },
        ]);
    })().catch((error: Error) => callback(error));
};

module.exports = {
    getReviewByUserAndProduct,
    addReviewByUserId,
    updateReviewByUserAndProduct,
    getReviews,
    getReviewsPaginated,
    getReviewsCount,
    getRatingSummary,
};
