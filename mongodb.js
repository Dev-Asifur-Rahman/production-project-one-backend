const database = {
  //    data base names will be here for auto suggestion
};

const collections = {
  //    collections names will be here for auto suggestion
};

const { MongoClient, ServerApiVersion } = require("mongodb");
const uri = process.env.MONGO_URI;

const db_instance = {};

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function connectDb() {
  await client.connect();

  // load all databases
  for (const singleDatabase in database) {
    db_instance[singleDatabase] = client.db(database[singleDatabase]);
  }

  return db_instance;
}

function getDB(database_name) {
  return db_instance[database_name];
}

module.exports = { database, collections, getDB, connectDb };
