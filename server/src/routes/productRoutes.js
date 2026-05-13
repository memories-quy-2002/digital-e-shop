const express = require("express");
const rateLimit = require("express-rate-limit");
const {
    addSingleProduct,
    getSingleProduct,
    getListProduct,
    deleteProduct,
    getInventorySummary,
    updateInventory,
    updateProduct,
    retrieveRelevantProducts,
    getRecommendations
} = require("../controllers/productController");
const { requireAdmin } = require("../middlewares/authMiddleWares");
const router = express.Router();
const path = require("path");

const UPLOADS_DIR = path.resolve(__dirname, '..', '..', 'server', 'src', 'uploads');

const productLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 100000,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
});

router.get("/:id", productLimiter, getSingleProduct);
router.get("/", productLimiter, getListProduct);
router.get("/admin/inventory-summary", productLimiter, requireAdmin, getInventorySummary);
router.get("/recommendations/:uid", productLimiter, getRecommendations);
router.post("/add", productLimiter, requireAdmin, addSingleProduct);
router.put("/:id/inventory", productLimiter, requireAdmin, updateInventory);
router.put("/:id", productLimiter, requireAdmin, updateProduct);
router.delete("/", productLimiter, requireAdmin, deleteProduct);
router.get("/relevant/:pid", productLimiter, retrieveRelevantProducts);
router.get('/images/:filename', async (req, res) => {
    const requestedFilename = req.params.filename + '.jpg';
    const imagePath = path.resolve(UPLOADS_DIR, requestedFilename);

    if (!imagePath.startsWith(UPLOADS_DIR + path.sep)) {
        return res.status(400).send('Invalid file path');
    }

    res.sendFile(imagePath);
});

module.exports = router;
