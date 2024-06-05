const { ServerApiVersion } = require('mongodb');

// retrieveRelevantProducts.js
const MongoClient = require('mongodb').MongoClient;

const uri = `mongodb+srv://vinhluu2608:vuongtranlinhlinh123456789@cluster0.teog563.mongodb.net/?retryWrites=true&w=majority`;

const retrieveRelevantProducts = async (productId) => {
    try {
        const client = new MongoClient(uri, { serverApi: ServerApiVersion.v1 });
        await client.connect();
        const db = client.db('e_commerce');
        const collection = db.collection('relevant_product');

        const documents = await collection.find({ product_id: parseInt(productId) }).toArray();
        console.log('The ten relevant products are:');
        documents[0].relevant_products.forEach((productId, idx) => {
            console.log(`Product ${idx}: ${JSON.stringify(productId)}`);
        });

        await client.close();
    } catch (error) {
        console.error('Error retrieving relevant products:', error);
    }
}

const productId = process.argv[2]; // Read product ID from command line argument
retrieveRelevantProducts(productId);
