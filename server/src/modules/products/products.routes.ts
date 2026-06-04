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

const router = Router();
const uploadsDir = path.resolve(__dirname, "..", "..", "..", "..", "src", "uploads");

const productLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 100000,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
});

router.get("/facets", productLimiter, getProductFacets);
router.get("/search", productLimiter, searchProducts);
router.get("/recommendations/:uid", productLimiter, getRecommendations);
router.get("/relevant/:pid", productLimiter, retrieveRelevantProducts);
router.get("/images/:filename", productLimiter, async (req: Request, res: Response) => {
    const requestedFilename = `${req.params.filename}.jpg`;
    const imagePath = path.resolve(uploadsDir, requestedFilename);

    if (!imagePath.startsWith(uploadsDir + path.sep)) {
        return res.status(400).send("Invalid file path");
    }

    return res.sendFile(imagePath);
});
router.get("/:id", productLimiter, getSingleProduct);
router.get("/", productLimiter, getListProduct);
router.post("/add", productLimiter, requireAdmin, addSingleProduct);
router.put("/:id/inventory", productLimiter, requireAdmin, updateInventory);
router.put("/:id", productLimiter, requireAdmin, updateProduct);
router.delete("/", productLimiter, requireAdmin, deleteProduct);

export default router;

