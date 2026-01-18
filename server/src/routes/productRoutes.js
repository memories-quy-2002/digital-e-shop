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

const UPLOADS_DIR = path.resolve(__dirname, '..', '..', 'server', 'src', 'uploads');

router.get("/:id", getSingleProduct);
router.get("/", getListProduct);
router.post("/add", addSingleProduct);
router.delete("/", deleteProduct);
router.get("/relevant/:pid", retrieveRelevantProducts);
router.get('/images/:filename', async (req, res) => {
    const requestedFilename = req.params.filename + '.jpg';
    const imagePath = path.resolve(UPLOADS_DIR, requestedFilename);

    if (!imagePath.startsWith(UPLOADS_DIR + path.sep)) {
        return res.status(400).send('Invalid file path');
    }

    res.sendFile(imagePath);
});

module.exports = router;