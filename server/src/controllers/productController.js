const pool = require('../config/db');
const util = require('util');
const multer = require('multer');
const { put } = require('@vercel/blob')
const { ServerApiVersion } = require('mongodb');
const MongoClient = require('mongodb').MongoClient;

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const DB_URI = `mongodb+srv://vinhluu2608:vuongtranlinhlinh123456789@cluster0.teog563.mongodb.net/?retryWrites=true&w=majority`;

const addSingleProduct = (req, res) => {
    const extractFileName = (url) => {
        const parts = url.split('/');
        const fileNameWithExtension = parts[parts.length - 1];
        const fileName = fileNameWithExtension.split('.')[0];
        return fileName;
    }
    const insertProduct = async (productName, description, fileName, categoryId, brandId, specifications, price, inventory) => {
        pool.query = util.promisify(pool.query);
        try {
            pool.query('START TRANSACTION');
            pool.query(
                'INSERT INTO products (name, description, main_image, category_id, brand_id, specifications, price, stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    productName,
                    description,
                    fileName,
                    categoryId,
                    brandId,
                    specifications,
                    price,
                    inventory
                ], (err, res) => {
                    if (err) {
                        console.error(err.message);
                        return;
                    }
                    pool.query('COMMIT');
                    console.log('Transaction committed successfully.');

                    return res.status(200).json({
                        msg: 'Product added successfully',
                    });
                }
            );
        } catch (error) {
            console.error('Error occurred:', error);
            pool.query('ROLLBACK');
            return res.status(500).json({
                msg: 'Internal server error',
                error: error.message
            });
        }
    }
    upload.single('image')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ msg: 'Error uploading file' });
        }
        const { name, description, category, brand, specifications, price, inventory } = req.body
        const image = req.file;
        const imageName = name.toLowerCase()
            .replace(/ /g, '_')
            .replace(/-/g, '_')
        const imageBuffer = image.buffer
        const token = process.env.BLOB_READ_WRITE_TOKEN;
        if (!token) {
            return res.status(500).json({ msg: 'BLOB_READ_WRITE_TOKEN is not set' });
        }
        const blob = await put(`uploads/${imageName}.jpg`, imageBuffer, { access: "public", token });
        const fileName = extractFileName(blob.url); // Hàm extractFileName sẽ lấy tên file từ URL của Blob

        // Check if all required fields are present
        if (!name || !description || !category || !brand || !price || !inventory) {
            return res.status(400).json({ msg: 'Please fill in all required fields' });
        }

        try {
            pool.query('START TRANSACTION', (err) => {
                if (err) {
                    console.error('Error starting transaction:', err);
                    throw err;
                }

                // Get or insert brand
                pool.query('SELECT id FROM brands WHERE name = ?', [brand], (error, results) => {
                    if (error) {
                        console.error('Error retrieving brand:', error);
                        throw error;
                    }

                    let brandId;
                    if (results.length > 0) {
                        brandId = results[0].id;
                    } else {
                        pool.query('INSERT INTO brands (name) VALUES (?)', [brand], (error, results) => {
                            if (error) {
                                console.error('Error inserting brand:', error);
                                throw error;
                            }
                            brandId = results.insertId;
                        });
                    }

                    // Get or insert category
                    pool.query('SELECT id FROM categories WHERE name = ?', [category], (error, results) => {
                        if (error) {
                            console.error('Error retrieving category:', error);
                            throw error;
                        }

                        let categoryId;
                        if (results.length > 0) {
                            categoryId = results[0].id;
                        } else {
                            pool.query('INSERT INTO categories (name) VALUES (?)', [category], (error, results) => {
                                if (error) {
                                    console.error('Error inserting category:', error);
                                    throw error;
                                }
                                categoryId = results.insertId;
                            });
                        }

                        // Insert product only after both brandId and categoryId are obtained
                        insertProduct(name, description, fileName, categoryId, brandId, specifications, price, inventory);
                    });
                });
            });

        } catch (error) {
            console.error(error.message);
            pool.query("ROLLBACK");
            res.status(500).json({ msg: 'Internal server error' });
        }
    });
};

const getSingleProduct = (req, res) => {
    const pid = req.params.id;
    pool.query(
        `SELECT
		products.id,
		products.name,
		description,
		categories.name AS category,
		brands.name AS brand,
		price,
		sale_price,
		stock,
		main_image,
		image_gallery,
		specifications,
		rating,
		reviews
		FROM
			products
		JOIN categories ON categories.id = products.category_id
		JOIN brands ON brands.id = products.brand_id
		WHERE
			products.id = ?`,
        [pid],
        (error, results) => {
            if (error) {
                console.error(error.message);
            }
            if (results.length > 0) {
                const product = results[0];
                res.status(200).json({
                    product,
                    msg: "Get product successfully with id = " + pid,
                });
            } else {
                res.status(204).json({
                    msg: "Product not found",
                });
            }
        }
    );
};

const getListProduct = (req, res) => {
    pool.query(
        `SELECT
			products.id,
			products.name,
			description,
			categories.name AS category,
			brands.name AS brand,
			price,
			sale_price,
			stock,
			main_image,
			image_gallery,
			specifications,
			rating,
			reviews
		FROM
			products
		JOIN categories ON categories.id = products.category_id
		JOIN brands ON brands.id = products.brand_id`,
        (error, results) => {
            if (error) {
                console.error(error.message);
            }
            else if (results.length > 0) {
                res.status(200).json({
                    products: results,
                    msg: "Get list products successfully",
                });
            } else {
                res.status(204).json({
                    msg: "There is no product in store",
                });
            }
        }
    );
};

const deleteProduct = (req, res) => {
    const { pid } = req.body
    console.log(pid);

    pool.query(
        `DELETE FROM products WHERE id = ?`, [pid],
        (error, results) => {
            if (error) {
                console.error(error.message);
            }
            res.status(200).json({
                msg: `Delete product with id = ${pid} successfully`,
            });

        }
    );
};

const retrieveRelevantProducts = async (req, res) => {
    const pid = req.params.pid
    try {
        const client = new MongoClient(DB_URI, { serverApi: ServerApiVersion.v1 });
        await client.connect();
        const db = client.db('e_commerce');
        const collection = db.collection('relevant_product');

        const documents = await collection.find({ product_id: parseInt(pid) }).toArray();

        await client.close();
        if (documents.length > 0) {
            res.status(200).json({
                relevantProducts: documents[0].relevant_products,
                msg: `Retrieved products relevant with product id = ${pid} successfully`,
            });
        }
        else {
            res.status(200).json({
                relevantProducts: [],
                msg: `No relevant products found for product id = ${pid}`,
            })
        }
    } catch (error) {
        console.error('Error retrieving relevant products:', error);
    }
}

module.exports = {
    addSingleProduct,
    getSingleProduct,
    getListProduct,
    deleteProduct,
    retrieveRelevantProducts
};