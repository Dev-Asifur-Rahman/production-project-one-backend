const {
  dbConnect,
  db_database,
  db_collections,
} = require("../config/dealBondhuDB");

const archive_product_delete = async (req, res, next) => {
  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const archive_collection = db.collection(db_collections.archive_products);

  const now = new Date();

  const expiredProducts = await archive_collection
    .find({ delete_at: { $lte: now } })
    .toArray();

  if (expiredProducts.length > 0) {
    const ids = expiredProducts.map((p) => new ObjectId(p._id));
    await archive_collection.deleteMany({ _id: { $in: ids } });
  }

  next();
};

module.exports = archive_product_delete;
