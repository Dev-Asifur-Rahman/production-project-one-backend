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

app.get("/get_products/:category", async (req, res) => {
  const rawCategory = req.params.category;
  const rawSubcategory = req.query.subcategory;

  const category = decodeURIComponent(rawCategory).toLowerCase();
  const subcategory = rawSubcategory
    ? decodeURIComponent(rawSubcategory).toLowerCase()
    : null;

  const client = await connectDb();
  const db = client.db(databases.deal_bondhu);
  const product_collections = db.collection(collections.products);

  const filter = { category };

  if (subcategory !== "undefined") {
    filter.subcategory = subcategory;
  }

  const result = await product_collections.find(filter).toArray();
  res.send(result);
});

app.get("/get_product/:id", async (req, res) => {
  const id = req.params.id;
  const visitor_id = req.headers["x-visitor-id"];

  const client = await connectDb();
  const db = client.db(databases.deal_bondhu);
  const product_collection = db.collection(collections.products);
  const liked_collection = db.collection(collections.liked_products);

  let liked = false;

  const existing = await liked_collection.findOne({
    user_id: visitor_id,
    product_id: id,
  });

  if (existing) {
    liked = true;
  }

  const get_product = await product_collection.findOne({
    _id: new ObjectId(id),
  });

  const product = {
    ...get_product,
    liked,
  };

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

// get all clicks by last one month (just for you)
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
    const result =  await product_collection
      .aggregate([
        {
          $addFields: {
            offer_percent_num: { $toInt: "$offer_percent" },
          },
        },
        {
          $sort: { offer_percent_num: -1 },
        },
        {
          $limit: 10,
        },
      ])
      .toArray();

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
  const client = await connectDb();
  const db = client.db(databases.deal_bondhu);
  const user_product_collection = db.collection(collections.clicked_products);
  const product_collection = db.collection(collections.products);

  const last_seven_date = new Date();
  last_seven_date.setDate(last_seven_date.getDate() - 7);

  const popular_deals_pipeline = [
    {
      $match: {
        clicked_at: { $gte: last_seven_date },
      },
    },
    {
      $addFields: {
        daysAgo: {
          $dateDiff: {
            startDate: "$clicked_at",
            endDate: new Date(),
            unit: "day",
          },
        },
      },
    },
    {
      $addFields: {
        weight: {
          $switch: {
            branches: [
              { case: { $eq: ["$daysAgo", 0] }, then: 1.0 },
              { case: { $eq: ["$daysAgo", 1] }, then: 0.9 },
              { case: { $in: ["$daysAgo", [2, 3]] }, then: 0.8 },
              { case: { $in: ["$daysAgo", [4, 5]] }, then: 0.7 },
              { case: { $in: ["$daysAgo", [6, 7]] }, then: 0.6 },
            ],
            default: 0,
          },
        },
      },
    },
    {
      $group: {
        _id: "$product_id",
        popularityScore: { $sum: "$weight" },
        totalClicks: { $sum: 1 },
      },
    },
    {
      $sort: { popularityScore: -1 },
    },
    {
      $limit: 10,
    },
  ];

  const top_product_objects = await user_product_collection
    .aggregate(popular_deals_pipeline)
    .toArray();

  const product_ids = top_product_objects.map(
    (object) => new ObjectId(object._id)
  );

  const top_products = await product_collection
    .find({ _id: { $in: product_ids } })
    .limit(7)
    .toArray();

  res.send(top_products);
});

app.get("/trending_categories", async (req, res) => {
  const client = await connectDb();
  const db = client.db(databases.deal_bondhu);
  const clicked_product_collection = db.collection(collections.clicked_products);

  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);

  const fourteenDaysAgo = new Date(today);
  fourteenDaysAgo.setDate(today.getDate() - 14);

  // Aggregation pipeline
  const subcategory_pipeline = await clicked_product_collection
    .aggregate([
      {
        $match: {
          clicked_at: { $gte: fourteenDaysAgo, $lte: today },
        },
      },
      {
        $project: {
          category: 1,
          subcategory: 1,
          product_id: 1,
          week: {
            $cond: [
              { $gte: ["$clicked_at", sevenDaysAgo] },
              "thisWeek",
              "lastWeek",
            ],
          },
        },
      },
      {
        $group: {
          _id: { category: "$category", subcategory: "$subcategory", week: "$week" },
          totalClicks: { $sum: 1 },
          products: { $addToSet: "$product_id" },
        },
      },
    ])
    .toArray();

  // Reduce to calculate scores
  const subcategoryScores = subcategory_pipeline.reduce((acc, item) => {
    const cat = item._id.category;
    const subcat = item._id.subcategory;
    const key = `${cat}||${subcat}`; // unique key
    const week = item._id.week;

    if (!acc[key]) acc[key] = { category: cat, subcategory: subcat, thisWeek: 0, lastWeek: 0, productCount: 0 };

    acc[key][week] = item.totalClicks;
    acc[key].productCount = item.products.length;

    return acc;
  }, {});

  // Calculate score
  const scoredSubcategories = Object.values(subcategoryScores).map((data) => {
    const avgClicksPerProduct = data.thisWeek / data.productCount;
    const growth = data.lastWeek ? data.thisWeek / data.lastWeek : 1;
    return {
      category: data.category,
      subcategory: data.subcategory,
      score: avgClicksPerProduct * growth,
    };
  });

  // Sort descending
  scoredSubcategories.sort((a, b) => b.score - a.score);

  res.send(scoredSubcategories);
});


app.get("/trending_stores", async (req, res) => {
  const client = await connectDb();
  const db = client.db(databases.deal_bondhu);
  const product_collection = db.collection(collections.products);
  const clicked_products_collection = db.collection(
    collections.clicked_products
  );

  const now = new Date();

  const todayStart = new Date(now);
  const todayEnd = new Date(now);

  todayStart.setHours(0, 0, 0, 0);
  todayEnd.setHours(23, 59, 59, 999);

  const yesterdayStart = new Date(todayStart);
  const yesterdayEnd = new Date(todayEnd);

  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);

  const trending_pipeline = await clicked_products_collection
    .aggregate([
      {
        $match: { clicked_at: { $gte: yesterdayStart, $lte: todayEnd } },
      },
      {
        $project: {
          product_id: 1,
          day: {
            $cond: [
              { $gte: ["$clicked_at", todayStart] },
              "today",
              "yesterday",
            ],
          },
        },
      },
      {
        $group: {
          _id: { product_id: "$product_id", day: "$day" },
          clicks: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: "$_id.product_id",
          counts: { $push: { day: "$_id.day", clicks: "$clicks" } },
        },
      },
      {
        $project: {
          todayClicks: {
            $sum: {
              $map: {
                input: "$counts",
                as: "c",
                in: { $cond: [{ $eq: ["$$c.day", "today"] }, "$$c.clicks", 0] },
              },
            },
          },
          yesterdayClicks: {
            $sum: {
              $map: {
                input: "$counts",
                as: "c",
                in: {
                  $cond: [{ $eq: ["$$c.day", "yesterday"] }, "$$c.clicks", 0],
                },
              },
            },
          },
        },
      },
      // {
      //   $match: {
      //     todayClicks: { $gte: 1 },
      //     yesterdayClicks: { $gt: 0 },
      //     $expr: { $gte: [{ $divide: ["$todayClicks", "$yesterdayClicks"] }, 1.5] }
      //   }
      // },

      // {
      //   $addFields: {
      //     trendingScore: {
      //       $multiply: [
      //         { $divide: ["$todayClicks", "$yesterdayClicks"] },
      //         "$todayClicks",
      //       ],
      //     },
      //   },
      // },

      // this step is for testing
      {
        $match: {
          todayClicks: { $gte: 1 },
          $expr: {
            $gte: [
              {
                $cond: [
                  { $eq: ["$yesterdayClicks", 0] },
                  "$todayClicks",
                  { $divide: ["$todayClicks", "$yesterdayClicks"] },
                ],
              },
              1,
            ],
          },
        },
      },
      {
        $addFields: {
          trendingScore: {
            $multiply: [
              {
                $cond: [
                  { $eq: ["$yesterdayClicks", 0] },
                  "$todayClicks",
                  { $divide: ["$todayClicks", "$yesterdayClicks"] },
                ],
              },
              "$todayClicks",
            ],
          },
        },
      },
      // start after this
      { $sort: { trendingScore: -1 } },
      { $limit: 10 },
    ])
    .toArray();

  const product_ids = trending_pipeline.map((item) => new ObjectId(item._id));

  const top_products = await product_collection
    .find({ _id: { $in: product_ids } })
    .toArray();

  res.send(top_products);
});

app.post("/like_product", async (req, res) => {
  const client = await connectDb();
  const db = client.db(databases.deal_bondhu);
  const liked_collection = db.collection(collections.liked_products);

  const { user_id, product_id } = req.body;
  const document_object = {
    user_id,
    product_id,
    liked_at: new Date(),
  };

  const result = await liked_collection.insertOne(document_object);
  res.send(result);
});

// using routes
app.use("/users", users);

app.listen(PORT, () => {
  console.log("app is running on port");
});
