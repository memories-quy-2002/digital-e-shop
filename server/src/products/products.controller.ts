import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpException,
    Param,
    Post,
    Put,
    Query,
    Req,
    Res,
    StreamableFile,
    UseGuards,
    UseInterceptors,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthGuard } from "../guards/auth.guard";
import { Roles, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { NestProductsService } from "./products.service";
import { NestProductsRepository } from "./products.repository";
import { getValidationMessage } from "#src/shared/validation/requestSchemas";
import type { ProductCreateInput } from "./products.dto";
import { productCreateSchema, productUpdateSchema, inventoryUpdateSchema } from "./products.validator";

const uploadsDir = join(process.cwd(), "src", "uploads");

@Controller("products")
export class ProductsController {
    constructor(
        private readonly productsService: NestProductsService,
        private readonly productsRepository: NestProductsRepository,
    ) {}

    @Get("facets")
    async getProductFacets() {
        const facets = await this.productsRepository.getProductFacets();
        return {
            facets,
            msg: "Get product facets successfully",
        };
    }

    @Get("search")
    async searchProducts(@Query("q") q: string, @Query("limit") limit: string) {
        const term = typeof q === "string" ? q.trim() : "";
        const safeLimit = Math.min(Math.max(Number(limit) || 6, 1), 20);

        if (term.length < 2) {
            return { products: [], msg: "Search term too short" };
        }

        const results = await this.productsRepository.searchProducts(term, safeLimit);
        return { products: results || [], msg: "Search products successfully" };
    }

    @Get("recommendations/:uid")
    async getRecommendations(@Param("uid") uid: string, @Query("limit") limit: string) {
        const safeLimit = Math.min(Number(limit) || 12, 24);
        const results = await this.productsRepository.getRecommendedProductsByUserId(uid, safeLimit);
        return { products: results || [], msg: "Recommendations retrieved successfully" };
    }

    @Get("relevant/:pid")
    async retrieveRelevantProducts(@Param("pid") pidParam: string) {
        const pid = parseInt(pidParam, 10);
        if (!pid) {
            throw new HttpException({ msg: "Invalid product id" }, 400);
        }

        const results = await this.productsRepository.getRelevantProductsByProductId(pid, 8);
        return { relevantProducts: results || [], msg: "Retrieved relevant products successfully" };
    }

    @Get("images/:filename")
    async getImage(@Param("filename") filename: string, @Res({ passthrough: true }) res: Response) {
        const requestedFilename = `${filename}.jpg`;
        const imagePath = join(uploadsDir, requestedFilename);

        const fs = await import("node:fs");
        if (!fs.existsSync(imagePath)) {
            throw new HttpException({ msg: "Image not found" }, 404);
        }

        res.set({
            "Content-Type": "image/jpeg",
            "Content-Disposition": `inline; filename="${requestedFilename}"`,
        });

        const stream = createReadStream(imagePath);
        return new StreamableFile(stream);
    }

    @Get(":id")
    async getSingleProduct(@Param("id") id: string) {
        const numericId = Number(id);
        const product = await this.productsRepository.getProductById(numericId);
        if (!product) {
            throw new HttpException({ msg: "Product not found" }, 404);
        }
        return { product, msg: "Get product successfully" };
    }

    @Get()
    async getListProduct(
        @Query("page") page: string,
        @Query("limit") limit: string,
        @Query("term") term: string,
        @Query("categories") categories: string,
        @Query("brands") brands: string,
        @Query("minPrice") minPrice: string,
        @Query("maxPrice") maxPrice: string,
        @Query("sortBy") sortBy: string,
    ) {
        const pageNum = Number(page);
        const limitNum = Number(limit);
        const termStr = typeof term === "string" ? term.trim() : "";
        const categoriesArr = typeof categories === "string"
            ? categories.split(",").map((item: string) => item.trim()).filter(Boolean)
            : [];
        const brandsArr = typeof brands === "string"
            ? brands.split(",").map((item: string) => item.trim()).filter(Boolean)
            : [];
        const minPriceNum = Number(minPrice);
        const maxPriceNum = Number(maxPrice);
        const sortByStr = typeof sortBy === "string" ? sortBy : "relevance";

        const filters = {
            term: termStr,
            categories: categoriesArr,
            brands: brandsArr,
            minPrice: Number.isFinite(minPriceNum) ? minPriceNum : undefined,
            maxPrice: Number.isFinite(maxPriceNum) ? maxPriceNum : undefined,
            sortBy: sortByStr as "relevance" | "price-asc" | "price-desc" | "rating-desc" | "newest",
        };

        const usePagination = Number.isInteger(pageNum) && pageNum > 0 && Number.isInteger(limitNum) && limitNum > 0;
        const safeLimit = usePagination ? Math.min(limitNum, 100) : null;
        const offset = usePagination ? (pageNum - 1) * safeLimit : 0;
        const useFilteredQuery =
            Boolean(termStr) ||
            categoriesArr.length > 0 ||
            brandsArr.length > 0 ||
            Number.isFinite(minPriceNum) ||
            Number.isFinite(maxPriceNum) ||
            sortByStr !== "relevance";

        if (useFilteredQuery) {
            const resolvedLimit = safeLimit || 100;
            const [results, total] = await Promise.all([
                this.productsRepository.getProductsByFilters(filters, resolvedLimit, offset),
                this.productsRepository.countProductsByFilters(filters),
            ]);
            return {
                products: results || [],
                pagination: {
                    page: usePagination ? pageNum : 1,
                    limit: resolvedLimit,
                    total,
                    totalPages: Math.max(1, Math.ceil(total / resolvedLimit)),
                },
                msg: "Get list products successfully",
            };
        }

        if (usePagination) {
            const [results, total] = await Promise.all([
                this.productsRepository.getAllProductsPaginated(safeLimit as number, offset),
                this.productsRepository.getProductsCount(),
            ]);
            if (results.length === 0) {
                return { products: [], msg: "No product found" };
            }
            return {
                products: results,
                pagination: {
                    page: pageNum,
                    limit: safeLimit,
                    total,
                    totalPages: Math.ceil(total / safeLimit),
                },
                msg: "Get list products successfully",
            };
        }

        const results = await this.productsRepository.getAllProducts();
        if (results.length === 0) {
            return { products: [], msg: "No product found" };
        }
        return { products: results, msg: "Get list products successfully" };
    }

    @Post("add")
    @HttpCode(200)
    @UseGuards(AuthGuard, RolesGuard)
    @Roles("admin")
    @UseInterceptors(FileInterceptor("image"))
    async addSingleProduct(
        @Req() req: Request,
        @Body(new ZodValidationPipe(productCreateSchema)) body: Record<string, unknown>,
    ) {
        const file = req.file;
        try {
            const result = await this.productsService.addSingleProductService(body as ProductCreateInput, file);
            return result;
        } catch (err) {
            if (err instanceof Error && err.name === "ZodError") {
                throw new HttpException({ msg: getValidationMessage(err) }, 400);
            }
            const error = err as Error & { statusCode?: number };
            const statusCode = error?.statusCode || 500;
            throw new HttpException(
                { msg: statusCode === 500 ? "Internal server error" : error.message },
                statusCode,
            );
        }
    }

    @Put(":id/inventory")
    @HttpCode(200)
    @UseGuards(AuthGuard, RolesGuard)
    @Roles("admin")
    async updateInventory(
        @Param("id") id: string,
        @Body(new ZodValidationPipe(inventoryUpdateSchema)) body: { stock: number },
    ) {
        const pid = Number(id);

        if (!Number.isInteger(pid) || pid <= 0) {
            throw new HttpException({ msg: "Product id and stock must be valid" }, 400);
        }

        try {
            const product = await this.productsService.updateInventoryService(pid, body.stock);
            return { product, msg: "Inventory updated successfully" };
        } catch (err) {
            const error = err as Error & { statusCode?: number };
            if (error?.statusCode === 404) {
                throw new HttpException({ msg: "Product not found" }, 404);
            }
            throw new HttpException({ msg: "Internal server error", error: error?.message }, 500);
        }
    }

    @Put(":id")
    @HttpCode(200)
    @UseGuards(AuthGuard, RolesGuard)
    @Roles("admin")
    async updateProduct(
        @Param("id") id: string,
        @Body(new ZodValidationPipe(productUpdateSchema)) body: {
            name?: string;
            description?: string;
            category?: string;
            brand?: string;
            specifications?: string;
            price?: number;
            salePrice?: number | string | null;
            stock?: number;
        },
    ) {
        const pid = Number(id);

        if (!Number.isInteger(pid) || pid <= 0) {
            throw new HttpException({ msg: "Invalid product id" }, 400);
        }

        try {
            const product = await this.productsService.updateProductDetailsService(pid, {
                ...body,
                actorId: "admin",
            });
            return { product, msg: "Product has been updated successfully" };
        } catch (err) {
            if (err instanceof Error && err.name === "ZodError") {
                throw new HttpException({ msg: getValidationMessage(err) }, 400);
            }
            const error = err as Error & { statusCode?: number };
            const statusCode = error?.statusCode || 500;
            throw new HttpException(
                { msg: statusCode === 500 ? "Internal server error" : error.message },
                statusCode,
            );
        }
    }

    @Delete()
    @HttpCode(200)
    @UseGuards(AuthGuard, RolesGuard)
    @Roles("admin")
    async deleteProduct(@Body("pid") pid: number) {
        await this.productsRepository.deleteProduct(pid);
        return { msg: `Delete product with id = ${pid} successfully` };
    }
}
