const db_database = {
  deal_bondhu_database: "deal_bondhu",
};

const db_collections = {
  archive_products: "archive_products",
  users: "users",
  pending_products: "pending_products",
  banners: "banners",
  categories: "categories",
  product_comments: "product_comments",
  unliked_products: "unliked_products",
  saved_products: "saved_products",
  clicked_user_info_collection: "clicked_user_info",
  products: "products",
  clicked_products: "clicked_products",
  liked_products: "liked_products",
  swiper_speed : "swiper_speed",
  heading_marquee_collection : 'heading_marquee_collection'
};

const { MongoClient, ServerApiVersion } = require("mongodb");
const uri = process.env.DB_MONGO_URI;

let client;
let isConnected = false;

async function dbConnect() {
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
    console.log("Connected to deal bondhu Database");
  }

  return client;
}

module.exports = { dbConnect, db_database, db_collections };
