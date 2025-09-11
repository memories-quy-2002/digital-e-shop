const express = require("express");
const {
    addSingleProduct,
    getSingleProduct,
    getListProduct,
    deleteProduct,
    retrieveRelevantProducts
} = require("../controllers/productController");
const router = express.Router();
const path = require("path");

router.get("/:id", getSingleProduct);
router.get("/", getListProduct);
router.post("/add", addSingleProduct);
router.delete("/", deleteProduct);
router.get("/relevant/:pid", retrieveRelevantProducts);
router.get('/images/:filename', async (req, res) => {
    const imagePath = path.join(__dirname, '..', '..', 'server', 'src', 'uploads', req.params.filename + '.jpg');
    res.sendFile(imagePath);
});

module.exports = router;