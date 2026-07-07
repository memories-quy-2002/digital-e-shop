import { Router } from "express";
import type { Request, Response } from "express";
import rateLimit from "express-rate-limit";
const {
    addSingleProduct,
    getSingleProduct,
    getListProduct,
    deleteProduct,
    updateInventory,
    updateProduct,
    retrieveRelevantProducts,
    getRecommendations,
    searchProducts,
    getProductFacets,
} = require("./products.controller");
const { requireAdmin } = require("#src/modules/auth/auth.middleware");
import path from "node:path";
import { cacheResponse, invalidateByPattern } from "#src/core/cacheResponse";

const router = Router();
const uploadsDir = path.resolve(__dirname, "..", "..", "..", "..", "src", "uploads");

const productLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 100000,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
});

const cache = cacheResponse(300);

router.get("/facets", productLimiter, cache, getProductFacets);
router.get("/search", productLimiter, cache, searchProducts);
router.get("/recommendations/:uid", productLimiter, cache, getRecommendations);
router.get("/relevant/:pid", productLimiter, cache, retrieveRelevantProducts);
router.get("/images/:filename", productLimiter, async (req: Request, res: Response) => {
    const requestedFilename = `${req.params.filename}.jpg`;
    const imagePath = path.resolve(uploadsDir, requestedFilename);

    if (!imagePath.startsWith(uploadsDir + path.sep)) {
        return res.status(400).send("Invalid file path");
    }

    return res.sendFile(imagePath);
});
router.get("/:id", productLimiter, cache, getSingleProduct);
router.get("/", productLimiter, cache, getListProduct);

router.post("/add", productLimiter, requireAdmin, addSingleProduct, invalidateProductCache);
router.put("/:id/inventory", productLimiter, requireAdmin, updateInventory, invalidateProductCache);
router.put("/:id", productLimiter, requireAdmin, updateProduct, invalidateProductCache);
router.delete("/", productLimiter, requireAdmin, deleteProduct, invalidateProductCache);

function invalidateProductCache(_req: Request, _res: Response, next: () => void) {
    invalidateByPattern("/api/products*").catch(() => {});
    invalidateByPattern("/api/reviews*").catch(() => {});
    next();
}

export default router;
