const databases = {
  deal_bondhu: "deal_bondhu",
};

const collections = {
  clicked_user_info_collection: "clicked_user_info",
  products: "products",
};

const { MongoClient, ServerApiVersion } = require("mongodb");
const uri = process.env.MONGO_URI;

let client;
let isConnected = false;

// this function is used to connect to the database

async function connectDb() {
  // if already stored in client then returns
  if (isConnected && client) return client;

  // this will work for first time if not stored in client
  if (!client) {
    client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });
  }

  if (!isConnected) {
    await client.connect();
    isConnected = true;
    console.log('Connect to Database')
  }

  return client;
}
module.exports = { connectDb, databases, collections };
