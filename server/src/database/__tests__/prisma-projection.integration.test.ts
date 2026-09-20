import { afterAll, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";

const prisma = require("#src/database/prisma/client");
import { closeIntegrationPools, integrationPool } from "./integration-database";
import { NestProductsRepository } from "../../products/products.repository";

type CurrencyDefaultRow = RowDataPacket & {
    table_name: string;
    column_name: string;
    column_default: string | null;
};

describe("Prisma schema projection integration", () => {
    afterAll(async () => {
        await prisma.$disconnect();
        await closeIntegrationPools();
    });

    it("loads existing brand and category foreign-key relations", async () => {
        const brand = await prisma.brand.findFirst({
            select: {
                name: true,
                products: {
                    take: 1,
                    select: {
                        id: true,
                        name: true,
                        category: { select: { name: true } },
                    },
                },
            },
        });

        expect(brand?.name).toEqual(expect.any(String));
        expect(brand?.products).toHaveLength(1);
        expect(brand?.products[0].id).toEqual(expect.any(Number));
        expect(brand?.products[0].name).toEqual(expect.any(String));
        expect(brand?.products[0].category.name).toEqual(expect.any(String));
    });

    it("serves product facets through the Prisma catalog projection", async () => {
        const facets = await new NestProductsRepository().getProductFacets();

        expect(facets.categories.length).toBeGreaterThan(0);
        expect(facets.brands.length).toBeGreaterThan(0);
        expect(facets.totalProducts).toBeGreaterThan(0);
        expect(facets.minPrice).toBeGreaterThanOrEqual(0);
        expect(facets.maxPrice).toBeGreaterThanOrEqual(facets.minPrice);
    });

    it("loads the remaining legacy customer projections", async () => {
        const [address, notification, wishlist] = await Promise.all([
            prisma.customerAddress.findFirst({
                select: { id: true, userId: true, isDefault: true },
            }),
            prisma.customerNotification.findFirst({
                select: { id: true, userId: true, type: true },
            }),
            prisma.wishlist.findFirst({
                select: {
                    id: true,
                    userId: true,
                    user: { select: { id: true } },
                    product: { select: { id: true, name: true } },
                },
            }),
        ]);

        if (address) {
            expect(address.id).toEqual(expect.any(Number));
            expect(address.userId).toEqual(expect.any(String));
            expect(typeof address.isDefault).toBe("boolean");
        }

        if (notification) {
            expect(notification.id).toEqual(expect.any(Number));
            expect(notification.userId).toEqual(expect.any(String));
            expect(notification.type).toEqual(expect.any(String));
        }

        if (wishlist) {
            expect(wishlist.id).toEqual(expect.any(Number));
            expect(wishlist.userId).toEqual(expect.any(String));
            expect(wishlist.user.id).toEqual(expect.any(String));
            expect(wishlist.product.id).toEqual(expect.any(Number));
            expect(wishlist.product.name).toEqual(expect.any(String));
        }
    });

    it("keeps VND as the database default for new order and ledger rows", async () => {
        const [rows] = await integrationPool.execute<CurrencyDefaultRow[]>(
            `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, COLUMN_DEFAULT AS column_default
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND ((TABLE_NAME = 'orders' AND COLUMN_NAME = 'currency')
                 OR (TABLE_NAME = 'order_payments' AND COLUMN_NAME = 'base_currency'))`,
        );

        const defaults = new Map(rows.map((row) => [`${row.table_name}.${row.column_name}`, row.column_default]));

        expect(defaults.get("orders.currency")).toBe("VND");
        expect(defaults.get("order_payments.base_currency")).toBe("VND");
    });
});
