const {
  dbConnect,
  db_database,
  db_collections,
} = require("../config/dealBondhuDB");

const archiveChecker = async (req, res, next) => {
  const now = new Date();

  const db_client = await dbConnect();

  const db_db = db_client.db(db_database.deal_bondhu_database);

  const product_collection = db_db.collection(db_collections.products);
  const archived_collection = db_db.collection(db_collections.archive_products);

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
