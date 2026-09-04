const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env.docker"), override: true });

process.env.MOCK_ORDER_COUNT = process.env.MOCK_ORDER_COUNT || "50";
process.env.MOCK_REVIEW_COUNT = process.env.MOCK_REVIEW_COUNT || "50";

require(path.resolve(__dirname, "..", "src/database/seeders/seedMockOrdersReviews.js"));
