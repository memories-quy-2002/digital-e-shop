const pool = require("../config/db");

// Insert product
const insertProduct = (product, callback) => {
    pool.query(
        `INSERT INTO products (name, description, main_image, category_id, brand_id, specifications, price, stock)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            product.name,
            product.description,
            product.fileName,
            product.categoryId,
            product.brandId,
            product.specifications,
            product.price,
            product.inventory,
        ],
        callback
    );
};

// Find category by name
const findCategoryByName = (category, callback) => {
    pool.query("SELECT id FROM categories WHERE name = ?", [category], callback);
};

// Insert new category
const insertCategory = (category, callback) => {
    pool.query("INSERT INTO categories (name) VALUES (?)", [category], callback);
};

// Find brand by name
const findBrandByName = (brand, callback) => {
    pool.query("SELECT id FROM brands WHERE name = ?", [brand], callback);
};

// Insert new brand
const insertBrand = (brand, callback) => {
    pool.query("INSERT INTO brands (name) VALUES (?)", [brand], callback);
};

// Get product by id
const getProductById = (pid, callback) => {
    pool.query(
        `SELECT products.id, products.name, description, categories.name AS category,
            brands.name AS brand, price, sale_price, stock, main_image,
            image_gallery, specifications, rating, reviews
        FROM products
        JOIN categories ON categories.id = products.category_id
        JOIN brands ON brands.id = products.brand_id
        WHERE products.id = ?`,
        [pid],
        callback
    );
};

// Get all products
const getAllProducts = (callback) => {
    pool.query(
        `SELECT products.id, products.name, description, categories.name AS category,
            brands.name AS brand, price, sale_price, stock, main_image,
            image_gallery, specifications, rating, reviews
        FROM products
        JOIN categories ON categories.id = products.category_id
        JOIN brands ON brands.id = products.brand_id`,
        callback
    );
};

// Delete product
const deleteProduct = (pid, callback) => {
    pool.query("DELETE FROM products WHERE id = ?", [pid], callback);
};

module.exports = {
    insertProduct,
    findCategoryByName,
    insertCategory,
    findBrandByName,
    insertBrand,
    getProductById,
    getAllProducts,
    deleteProduct,
};
