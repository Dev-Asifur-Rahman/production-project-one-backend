const { ObjectId } = require("mongodb");
const { connectDb, databases, collections } = require("../config/mongodb");

const archive_product_delete = async (req, res, next) => {
  const client = await connectDb();
  const db = client.db(databases.deal_bondhu);
  const archive_collection = db.collection(collections.archive_products);

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
