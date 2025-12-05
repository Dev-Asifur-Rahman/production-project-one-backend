require("dotenv").config();

// route files
const users = require("./routes/users.js");

const express = require("express");
const cors = require("cors");
const user_agent = require("useragent");

const getLookUp = require("./config/lookupDbLoad");
const { connectDb, databases, collections } = require("./config/mongodb.js");
const { ObjectId } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.set("trust proxy", true);

app.get("/", async (req, res) => {
  res.send("Deal Bondhu Backend Server is Running");
});

app.get("/clicked_user_data", async (req, res) => {
  const search = req.query.search;
  let filter = {};

  if (search && search !== "all") {
    filter = {
      $or: [
        { company: { $regex: search, $options: "i" } },
        { "geo.country": { $regex: search, $options: "i" } },
      ],
    };
  }

  const client = await connectDb();
  const db = client.db(databases.deal_bondhu);
  const track_info_collection = db.collection(
    collections.clicked_user_info_collection
  );

  const data = await track_info_collection.find(filter).toArray();
  res.send(data);
});

app.get("/get_products", async (req, res) => {
  const client = await connectDb();
  const db = client.db(databases.deal_bondhu);
  const product_collections = db.collection(collections.products);

  const result = await product_collections.find({}).toArray();
  res.send(result);
});

app.get("/get_product/:id", async (req, res) => {
  const id = req.params.id;

  const client = await connectDb();
  const db = client.db(databases.deal_bondhu);
  const product_collection = db.collection(collections.products);
  const product = await product_collection.findOne({ _id: new ObjectId(id) });

  res.send(product);
});

app.post("/post_track_info", async (req, res) => {
  const agent = user_agent.parse(req.headers["user-agent"]);

  const browser = agent?.family || null;

  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket.remoteAddress ||
    req.ip;

  const lookup = await getLookUp();
  const geo = lookup.get(ip) || {};

  const { product_name, product_link, company } = req.body;

  const client = await connectDb();
  const db = client.db(databases.deal_bondhu);
  const clicked_collection = db.collection(
    collections.clicked_user_info_collection
  );

  const user_clicked_info = {
    product_name,
    product_link,
    company,
    date: new Date(),
    device: browser,
    geo:
      {
        ip,
        country: geo?.country?.names?.en,
        countryCode: geo?.country?.iso_code,
        lat: geo?.location?.latitude,
        lon: geo?.location?.longitude,
        timezone: geo?.location?.time_zone,
      } || undefined,
  };

  const result = await clicked_collection.insertOne(user_clicked_info);

  res.send(result);
});

app.post("/upload_product", async (req, res) => {
  const product = req.body;

  const client = await connectDb();
  const db = client.db(databases.deal_bondhu);
  const product_collection = db.collection(collections.products);

  const result = await product_collection.insertOne({
    ...product,
    created_at: new Date(),
  });
  res.send(result);
});

// get all clicks by last one month
app.post("/recent_clicks", async (req, res) => {
  const client = await connectDb();
  const db = client.db(databases.deal_bondhu);
  const clicked_collection = db.collection(collections.clicked_products);
  const product_collection = db.collection(collections.products);

  const cookie_user_id = req.body?.user_id;
  const lastOneMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const all_clicks = await clicked_collection
    .find({
      user_id: cookie_user_id,
      clicked_at: { $gte: lastOneMonth },
    })
    .toArray();

  if (all_clicks.length === 0) {
    const result = await product_collection.find({}).limit(10).toArray();

    return res.send(result);
  }

  let category_score = {};

  all_clicks.forEach((click) => {
    const daysAgo =
      (Date.now() - new Date(click.clicked_at)) / (1000 * 3600 * 24);

    let weight = 0;
    if (daysAgo <= 1) weight = 1;
    else if (daysAgo <= 2) weight = 0.9;
    else if (daysAgo <= 7) weight = 0.7;
    else if (daysAgo <= 14) weight = 0.5;
    else if (daysAgo <= 30) weight = 0.3;

    category_score[click.category] =
      (category_score[click.category] || 0) + weight;
  });

  const topThreeCategories = Object.entries(category_score)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => cat);

  const SIXTY_DAYS = 60 * 24 * 60 * 60 * 1000;

  const topProducts = await product_collection
    .find({
      category: { $in: topThreeCategories },
      created_at: { $gte: new Date(Date.now() - SIXTY_DAYS) },
    })
    .limit(10)
    .toArray();

  return res.send(topProducts);
});

app.post("/upload_click_products", async (req, res) => {
  const client = await connectDb();
  const db = client.db(databases.deal_bondhu);
  const clicked_products_collection = db.collection(
    collections.clicked_products
  );

  const clicked_object = req.body;

  const result = await clicked_products_collection.insertOne({
    ...clicked_object,
    clicked_at: new Date(),
  });
  res.send(result);
});

app.get("/popular_deals", async (req, res) => {
  res.send("hello");
});

app.get("/trending_categories", async (req, res) => {
  res.send("hello");
});

app.get("/trending_store", async (req, res) => {
  res.send("hello");
});

// using routes
app.use("/users", users);

app.listen(PORT, () => {
  console.log("app is running on port");
});
