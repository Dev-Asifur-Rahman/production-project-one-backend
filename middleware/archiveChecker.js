const {
  dbConnect,
  db_database,
  db_collections,
} = require("../config/dealBondhuDB");
const { databases, connectDb, collections } = require("../config/mongodb");

const archiveChecker = async (req, res, next) => {
  const now = new Date();

  const db_client = await connectDb();

  const db_db = db_client.db(databases.deal_bondhu);

  const product_collection = db_db.collection(collections.products);
  const archived_collection = db_db.collection(collections.archive_products);

  const expiredProducts = await product_collection
    .find({ archive_at: { $lte: now } })
    .toArray();

  if (expiredProducts.length === 0) {
    return next();
  } else {
    const archiveProducts = expiredProducts.map(({ _id, ...rest }) => ({
      ...rest,
    }));

    await archived_collection.insertMany(archiveProducts);

    const expiredIds = expiredProducts.map((p) => p._id);

    await product_collection.deleteMany({ _id: { $in: expiredIds } });
  }
};

module.exports = archiveChecker;
