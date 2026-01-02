require("dotenv").config();

// route files
const users = require("./routes/users.js");

const express = require("express");
const cors = require("cors");
const user_agent = require("useragent");
const bcrypt = require("bcrypt");

const getLookUp = require("./config/lookupDbLoad");

const { ObjectId } = require("mongodb");
const {
  dbConnect,
  db_database,
  db_collections,
} = require("./config/dealBondhuDB.js");
const archiveChecker = require("./middleware/archiveChecker.js");
const archive_product_delete = require("./middleware/archiveProductDelete.js");
const sendMail = require("./utils/sendEmail.js");
const {
  calculatePoints,
  pointCategoryObject,
} = require("./utils/calculatePoints.js");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.set("trust proxy", true);

app.get("/", async (req, res) => {
  res.send("Deal Bondhu Backend Server is Running");
});

app.get("/clicked_user_data", async (req, res) => {
  try {
    const search = req.query.search || "all";
    const date = req.query.date;
    const limit = parseInt(req.query.limit) || 15;

    let filter = {};

    if (search && search !== "all") {
      filter.$or = [
        { company: { $regex: search, $options: "i" } },
        { "geo.country": { $regex: search, $options: "i" } },
      ];
    }

    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);

      filter.date = { $gte: start, $lte: end };
    }

    const client = await dbConnect();
    const db = client.db(db_database.deal_bondhu_database);
    const track_info_collection = db.collection(
      db_collections.clicked_user_info_collection
    );

    const data = await track_info_collection
      .find(filter)
      .limit(limit)
      .toArray();

    res.send({ success: true, data });
  } catch (error) {
    console.error("Error fetching clicked user data:", error);
    res.status(500).send({ success: false, message: "Server Error" });
  }
});

app.get("/admin_get_products", async (req, res) => {
  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const product_collection = db.collection(db_collections.products);
  const result = await product_collection.find({}).toArray();
  res.send(result);
});

app.get("/admin_get_product/:id", async (req, res) => {
  const { id } = req.params;

  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const product_collection = db.collection(db_collections.products);

  const product = await product_collection.findOne({ _id: new ObjectId(id) });

  res.send(product);
});

app.post("/archive_existing_product/:id", async (req, res) => {
  const { id } = req.params;
  const db_client = await dbConnect();

  const db_db = db_client.db(db_database.deal_bondhu_database);

  const product_collection = db_db.collection(db_collections.products);
  const archived_collection = db_db.collection(db_collections.archive_products);

  const getProduct = await product_collection.findOne({
    _id: new ObjectId(id),
  });

  if (getProduct) {
    const { _id, ...product } = getProduct;

    const result = await archived_collection.insertOne(product);

    const delete_result = await product_collection.deleteOne({
      _id: new ObjectId(id),
    });

    res.send(result);
  }
});

app.patch("/update_existing_product/:id", async (req, res) => {
  const { id } = req.params;
  const product = req.body;

  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const product_collection = db.collection(db_collections.products);

  const result = await product_collection.updateOne(
    { _id: new ObjectId(id) },
    { $set: product }
  );
  res.send(result);
});

app.get("/get_products/:category", async (req, res) => {
  const rawCategory = req.params.category;
  const rawSubcategory = req.query.subcategory;

  const category = decodeURIComponent(rawCategory).toLowerCase();
  const subcategory = rawSubcategory
    ? decodeURIComponent(rawSubcategory).toLowerCase()
    : null;

  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const product_collections = db.collection(db_collections.products);

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

  const db_client = await dbConnect();

  const db_db = db_client.db(db_database.deal_bondhu_database);

  const product_collection = db_db.collection(db_collections.products);
  const liked_collection = db_db.collection(db_collections.liked_products);
  const clicked_collection = db_db.collection(db_collections.clicked_products);
  const unliked_collection = db_db.collection(db_collections.unliked_products);
  const comment_collection = db_db.collection(db_collections.product_comments);
  const saved_product_collection = db_db.collection(
    db_collections.saved_products
  );

  let liked = false;
  let unliked = false;
  let isSaved = false;

  const saved = await saved_product_collection.findOne({
    product_id: id,
    user_id: visitor_id,
  });

  const existing_like = await liked_collection.findOne({
    user_id: visitor_id,
    product_id: id,
  });

  const existing_unlike = await unliked_collection.findOne({
    user_id: visitor_id,
    product_id: id,
  });

  const like_count = await liked_collection.countDocuments({ product_id: id });
  const unlike_count = await unliked_collection.countDocuments({
    product_id: id,
  });

  const comment_count = await comment_collection.countDocuments({
    product_id: id,
  });
  const click_count = await clicked_collection.countDocuments({
    product_id: id,
  });

  if (existing_like) {
    liked = true;
  }

  if (existing_unlike) {
    unliked = true;
  }

  if (saved) {
    isSaved = true;
  }

  const get_product = await product_collection.findOne({
    _id: new ObjectId(id),
  });

  const product = {
    ...get_product,
    liked,
    unliked,
    like_count,
    unlike_count,
    comment_count,
    click_count,
    isSaved,
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

  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const clicked_collection = db.collection(
    db_collections.clicked_user_info_collection
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

app.post("/approve_pending_product/:id", async (req, res) => {
  const { id } = req.params;

  const db_client = await dbConnect();
  const db_db = db_client.db(db_database.deal_bondhu_database);

  const product_collection = db_db.collection(db_collections.products);
  const pending_product_collection = db_db.collection(
    db_collections.pending_products
  );
  const users_collection = db_db.collection(db_collections.users);

  const find_product = await pending_product_collection.findOne({
    _id: new ObjectId(id),
  });
  if (find_product) {
    const { _id, archive_at, status, ...modified_product } = find_product;
    const product = {
      ...modified_product,
      status: "approved",
      created_at: new Date(),
      archive_at: archive_at,
      delete_at: new Date(archive_at.getTime() + 5 * 24 * 60 * 60 * 1000),
    };
    const delete_product = await pending_product_collection.deleteOne({
      _id: new ObjectId(id),
    });

    const result = await product_collection.insertOne(product);

    const find_user = await users_collection.findOne({
      user_id: find_product?.user_id,
    });

    if (find_user) {
      const final_result = await calculatePoints(
        pointCategoryObject.post,
        find_product?.dealer_id
      );
      if (final_result) {
        return res.send({ acknowledged: true });
      }
    }
  } else {
    return res.send({ success: false, message: "product not found" });
  }
});

// get all clicks by last one month (just for you)
app.post("/recent_clicks", archiveChecker, async (req, res) => {
  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);

  const clicked_collection = db.collection(db_collections.clicked_products);
  const product_collection = db.collection(db_collections.products);

  const cookie_user_id = req.body?.user_id;
  const lastOneMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const SIXTY_DAYS = 60 * 24 * 60 * 60 * 1000;

  const all_clicks = await clicked_collection
    .find({
      user_id: cookie_user_id,
      clicked_at: { $gte: lastOneMonth },
    })
    .toArray();

  if (all_clicks.length === 0) {
    const result = await product_collection
      .find({})
      .sort({ created_at: -1 })
      .limit(10)
      .toArray();

    return res.send(result);
  }

  let subcategory_score = {};

  all_clicks.forEach((click) => {
    const daysAgo =
      (Date.now() - new Date(click.clicked_at)) / (1000 * 3600 * 24);

    let weight = 0;
    if (daysAgo <= 1) weight = 1;
    else if (daysAgo <= 2) weight = 0.9;
    else if (daysAgo <= 7) weight = 0.7;
    else if (daysAgo <= 14) weight = 0.5;
    else if (daysAgo <= 30) weight = 0.3;

    subcategory_score[click.subcategory] =
      (subcategory_score[click.subcategory] || 0) + weight;
  });

  const topSubcategories = Object.entries(subcategory_score)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([sub]) => sub);

  let distribution = [];
  if (topSubcategories.length === 1) distribution = [10];
  else if (topSubcategories.length === 2) distribution = [6, 4];
  else distribution = [4, 3, 3];

  let finalProducts = [];
  let usedIds = new Set();

  for (let i = 0; i < topSubcategories.length; i++) {
    const products = await product_collection
      .find({
        subcategory: topSubcategories[i],
        created_at: { $gte: new Date(Date.now() - SIXTY_DAYS) },
        _id: { $nin: Array.from(usedIds) },
      })
      .sort({ created_at: -1 })
      .limit(distribution[i])
      .toArray();

    products.forEach((p) => usedIds.add(p._id.toString()));
    finalProducts.push(...products);
  }
  return res.send(finalProducts);
});

app.post("/upload_click_products", async (req, res) => {
  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const clicked_products_collection = db.collection(
    db_collections.clicked_products
  );
  const product_collection = db.collection(db_collections.products);
  const users_collections = db.collection(db_collections.users);

  const clicked_object = req.body;

  const result = await clicked_products_collection.insertOne({
    ...clicked_object,
    clicked_at: new Date(),
  });

  const id = clicked_object?.product_id;

  const find_product = await product_collection.findOne({
    _id: new ObjectId(id),
  });
  const userId = find_product?.dealer_id;

  const find_user = await users_collections.findOne({ user_id: userId });
  if (find_user) {
    const final_result = await calculatePoints(
      pointCategoryObject.click,
      userId
    );
    res.send(final_result);
  }
});

app.get("/popular_deals", async (req, res) => {
  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const user_product_collection = db.collection(
    db_collections.clicked_products
  );
  const product_collection = db.collection(db_collections.products);

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
  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const clicked_product_collection = db.collection(
    db_collections.clicked_products
  );

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
          _id: {
            category: "$category",
            subcategory: "$subcategory",
            week: "$week",
          },
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

    if (!acc[key])
      acc[key] = {
        category: cat,
        subcategory: subcat,
        thisWeek: 0,
        lastWeek: 0,
        productCount: 0,
      };

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
  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const product_collection = db.collection(db_collections.products);
  const clicked_products_collection = db.collection(
    db_collections.clicked_products
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
  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const liked_collection = db.collection(db_collections.liked_products);
  const product_collection = db.collection(db_collections.products);
  const users_collections = db.collection(db_collections.users);

  const { user_id, product_id, category, subcategory, dealer_id } = req.body;
  const document_object = {
    user_id,
    product_id,
    category,
    subcategory,
    dealer_id,
    liked_at: new Date(),
  };
  const result = await liked_collection.insertOne(document_object);

  const find_product = await product_collection.findOne({
    _id: new ObjectId(product_id),
  });
  const userId = find_product?.dealer_id;

  const find_user = await users_collections.findOne({ user_id: userId });
  if (find_user) {
    const final_result = await calculatePoints(
      pointCategoryObject.like,
      userId
    );
    res.send(final_result);
  }
});

app.post("/unlike_product", async (req, res) => {
  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const unliked_collection = db.collection(db_collections.unliked_products);

  const { user_id, product_id } = req.body;
  const document_object = {
    user_id,
    product_id,
    unliked_at: new Date(),
  };

  const result = await unliked_collection.insertOne(document_object);
  res.send(result);
});

app.post("/upload_comment", async (req, res) => {
  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const comment_collection = db.collection(db_collections.product_comments);

  const { user_id, product_id, comment } = req.body;
  const document_object = {
    user_id,
    product_id,
    commented_at: new Date(),
    comment,
  };

  const result = await comment_collection.insertOne(document_object);
  res.send(result);
});

app.get("/pending_products", async (req, res) => {
  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const pending_product_collection = db.collection(
    db_collections.pending_products
  );
  const result = await pending_product_collection.find({}).toArray();
  res.send(result);
});

app.post("/upload_pending_product", async (req, res) => {
  const pending_product = req.body;

  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const pending_product_collection = db.collection(
    db_collections.pending_products
  );

  const { expired_at, ...dateLessProduct } = pending_product;

  const product = {
    ...dateLessProduct,
    archive_at: new Date(expired_at),
  };

  const result = await pending_product_collection.insertOne(product);

  res.send(result);
});

app.get("/single_pending_product/:id", async (req, res) => {
  const id = req.params;

  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const pending_product_collection = db.collection(
    db_collections.pending_products
  );

  const result = await pending_product_collection.findOne({
    _id: new ObjectId(id.id),
  });
  res.send(result);
});

app.patch("/update_pending_product/:id", async (req, res) => {
  const { id } = req.params;
  const product = req.body;

  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const pending_product_collection = db.collection(
    db_collections.pending_products
  );

  const result = await pending_product_collection.updateOne(
    { _id: new ObjectId(id) },
    { $set: product }
  );
  res.send(result);
});

app.get("/archive_products", archive_product_delete, async (req, res) => {
  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const archive_collection = db.collection(db_collections.archive_products);

  const result = await archive_collection.find({}).toArray();
  res.send(result);
});

app.post("/archive_pending_products/:id", async (req, res) => {
  const { id } = req.params;
  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const pending_collection = db.collection(db_collections.pending_products);
  const archive_collection = db.collection(db_collections.archive_products);

  const getProduct = await pending_collection.findOne({
    _id: new ObjectId(id),
  });

  if (getProduct) {
    const { _id, product } = getProduct;

    const result = await archive_collection.insertOne(product);
    const delete_result = await pending_collection.deleteOne({
      _id: new ObjectId(id),
    });

    res.send(result);
  }
});

app.delete("/delete_archive_product/:id", async (req, res) => {
  const { id } = req.params;
  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const archive_collection = db.collection(db_collections.archive_products);

  const product = await archive_collection.findOne({ _id: new ObjectId(id) });

  if (!product) {
    return res.send({ success: false, message: "no product found" });
  }

  const result = await archive_collection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});

app.post("/upload_category_subcategory", async (req, res) => {
  const category = req.query.category;
  const subcategory = req.query.subcategory;

  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const category_collections = db.collection(db_collections.categories);

  if (!category && !subcategory) {
    return res.send({
      success: false,
      message: "Category or Subcategory is required",
    });
  }

  if (!category && subcategory) {
    return res.send({
      success: false,
      message: "Category is required to add subcategory",
    });
  }

  if (category && !subcategory) {
    const existingCategory = await category_collections.findOne({
      name: { $regex: `^${category}$`, $options: "i" },
    });

    if (existingCategory) {
      return res.send({
        success: false,
        message: "Category already exists",
      });
    }

    await category_collections.insertOne({
      name: category,
      subcategories: [],
    });

    return res.send({
      success: true,
      message: "Category added successfully",
    });
  }

  if (category && subcategory) {
    let existingCategory = await category_collections.findOne({
      name: { $regex: `^${category}$`, $options: "i" },
    });

    if (existingCategory) {
      const duplicateSub = existingCategory.subcategories.find(
        (sub) => sub.toLowerCase() === subcategory.toLowerCase()
      );

      if (duplicateSub) {
        return res.send({
          success: false,
          message: "Subcategory already exists in this category",
        });
      }

      await category_collections.updateOne(
        { _id: existingCategory._id },
        { $push: { subcategories: subcategory } }
      );

      return res.send({
        success: true,
        message: "Subcategory added to existing category",
      });
    } else {
      await category_collections.insertOne({
        name: category,
        subcategories: [subcategory],
      });

      return res.send({
        success: true,
        message: "Category and Subcategory created successfully",
      });
    }
  }
});

app.delete("/delete_category/:id", async (req, res) => {
  const { id } = req.params;

  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const category_collections = db.collection(db_collections.categories);

  const findCategory = await category_collections.findOne({
    _id: new ObjectId(id),
  });

  if (findCategory) {
    const result = await category_collections.deleteOne({
      _id: new ObjectId(id),
    });
    res.send(result);
  }
});

app.delete("/delete_subcategory/:id", async (req, res) => {
  const { id } = req.params;
  const subCategory = req.query.subcategory;

  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const category_collections = db.collection(db_collections.categories);

  const find_category = await category_collections.findOne({
    _id: new ObjectId(id),
  });
  if (!find_category) {
    return res.send({ success: false, message: "Product not Found" });
  }

  const result = await category_collections.updateOne(
    { _id: new ObjectId(id) },
    { $pull: { subcategory: subCategory } }
  );
  res.send(result);
});

app.get("/banners", async (req, res) => {
  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const banner_collections = db.collection(db_collections.banners);

  const result = await banner_collections.find({}).sort({ order: 1 }).toArray();

  res.send(result);
});

app.post("/upload_banner", async (req, res) => {
  const object = req.body;

  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const banner_collections = db.collection(db_collections.banners);
  const total_documents = await banner_collections.countDocuments();

  const banner = {
    ...object,
    order: total_documents + 1,
    created_at: new Date(),
  };

  const result = await banner_collections.insertOne(banner);
  res.send(result);
});

app.patch("/banner_sort", async (req, res) => {
  const id = req.query.id;
  const sort_type = req.query.sort;

  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const banner_collections = db.collection(db_collections.banners);

  const current = await banner_collections.findOne({ _id: new ObjectId(id) });

  if (!current) {
    return res.send({ message: "Banner not found" });
  }

  const targetOrder =
    sort_type === "up"
      ? current.order - 1
      : sort_type === "down"
      ? current.order + 1
      : null;

  if (targetOrder === null) {
    return res.send({ message: "Invalid sort type" });
  }

  if (targetOrder < 1) {
    return res.send({ success: false, message: "Already at top" });
  }

  const swap_banner = await banner_collections.findOne({ order: targetOrder });
  if (!swap_banner) {
    return res.send({ success: false, message: "banner already in bottom" });
  }

  await banner_collections.updateOne(
    { _id: swap_banner._id },
    { $set: { order: current.order } }
  );

  const result = await banner_collections.updateOne(
    { _id: current._id },
    { $set: { order: targetOrder } }
  );

  res.send(result);
});

app.delete("/delete_banner/:id", async (req, res) => {
  const { id } = req.params;
  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const banner_collections = db.collection(db_collections.banners);

  const banner = await banner_collections.find({ _id: new ObjectId(id) });

  if (!banner) {
    res.send({ success: false, message: "no banner found" });
  } else {
    const result = await banner_collections.deleteOne({
      _id: new ObjectId(id),
    });

    res.send(result);
  }
});

app.post("/upload_saved_product", async (req, res) => {
  const body = req.body;

  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const saved_product_collection = db.collection(db_collections.saved_products);

  const saved_product_object = {
    ...body,
    saved_at: new Date(),
  };

  const result = await saved_product_collection.insertOne(saved_product_object);
  res.send(result);
});

app.delete("/delete_saved_product/:id", async (req, res) => {
  const { id } = req.params;
  const user_id = req.query.user_id;

  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const saved_product_collection = db.collection(db_collections.saved_products);

  const find_saved_product = await saved_product_collection.findOne({
    product_id: id,
    user_id: user_id,
  });

  if (!find_saved_product) {
    return res.send({ success: false, message: "Product not Found" });
  } else {
    const result = await saved_product_collection.deleteOne({
      product_id: id,
      user_id: user_id,
    });
    return res.send(result);
  }
});

app.get("/get_swiper_speed/:id", async (req, res) => {
  const { id } = req.params;
  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const swiper_speed_collection = db.collection(db_collections.swiper_speed);

  const swiper_speed = await swiper_speed_collection.findOne({
    _id: new ObjectId(id),
  });

  return res.send(swiper_speed);
});

app.put("/update_swiper_speed/:id", async (req, res) => {
  const { id } = req.params;
  const body = req.body;
  const { time } = body;

  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const swiper_speed_collection = db.collection(db_collections.swiper_speed);

  const result = await swiper_speed_collection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { time: time } }
  );

  return res.send(result);
});

app.post("/verify_email/:email", async (req, res) => {
  const { email } = req.params;

  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const users_collection = db.collection(db_collections.users);

  const find_user = await users_collection.findOne({
    email: email,
    method: "email",
  });

  if (!find_user) {
    return res.send({ success: false, message: "Email not Found" });
  } else {
    const reset_code = Math.floor(100000 + Math.random() * 900000).toString();

    const update_result = await users_collection.updateOne(
      { email: email, method: "email" },
      { $set: { reset_code: reset_code } },
      { upsert: false }
    );

    if (update_result.acknowledged === true) {
      const mail_result = await sendMail(email, reset_code);
      if (mail_result.accepted.length === 0) {
        await users_collection.updateOne(
          { email: email, method: "email" },
          { $unset: { reset_code: "" } }
        );
        return res.send({
          success: false,
          message: "The Email You Entered Doesn't Exists",
        });
      } else {
        return res.send(mail_result);
      }
    } else {
      return res.send({
        success: false,
        message: "Code Send Failed Try Again",
      });
    }
  }
});

app.post("/verify_reset_code", async (req, res) => {
  const object = req.body;
  const { email, code } = object;

  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const users_collection = db.collection(db_collections.users);

  const find_reset_user = await users_collection.findOne({
    email,
    method: "email",
    reset_code: { $exists: true },
  });

  if (!find_reset_user) {
    return res.send({ success: false, message: "Set Your OTP First" });
  } else {
    if (find_reset_user?.reset_code !== code) {
      return res.send({ success: false, message: "Enter Valid OTP" });
    } else {
      return res.send({ success: true, message: "Verification Successful" });
    }
  }
});

app.post("/reset_new_password", async (req, res) => {
  const body = req.body;
  const { email, password } = body;
  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const users_collection = db.collection(db_collections.users);

  const find_user = await users_collection.findOne({
    email,
    method: "email",
    reset_code: { $exists: true },
  });
  if (!find_user) {
    return res.send({ success: false, message: "Send OTP First" });
  } else {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const updateResult = await users_collection.updateOne(
      { email, method: "email" },
      {
        $set: { password: hashedPassword },
        $unset: { reset_code: "" },
      }
    );
    res.send(updateResult);
  }
});

app.get("/leaderboard", async (req, res) => {
  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const users_collection = db.collection(db_collections.users);

  const leaderboard = await users_collection
    .find({})
    .sort({ points: -1 })
    .limit(50)
    .toArray();

  res.send(leaderboard);
});

app.get("/monthly_rising_stars", async (req, res) => {
  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);

  const users_collection = db.collection(db_collections.users);
  const product_collection = db.collection(db_collections.products);
  const clicked_products_collection = db.collection(
    db_collections.clicked_products
  );
  const liked_products_collection = db.collection(
    db_collections.liked_products
  );

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const postPoints = await product_collection
    .aggregate([
      { $match: { created_at: { $gte: startOfMonth } } },
      { $group: { _id: "$dealer_id", points: { $sum: 50 } } },
    ])
    .toArray();

  const clickPoints = await clicked_products_collection
    .aggregate([
      { $match: { clicked_at: { $gte: startOfMonth } } },
      { $group: { _id: "$dealer_id", points: { $sum: 5 } } },
    ])
    .toArray();

  const likePoints = await liked_products_collection
    .aggregate([
      { $match: { liked_at: { $gte: startOfMonth } } },
      { $group: { _id: "$dealer_id", points: { $sum: 10 } } },
    ])
    .toArray();

  const monthlyMap = {};
  const mergePoints = (arr) => {
    arr.forEach((item) => {
      if (!monthlyMap[item._id]) monthlyMap[item._id] = 0;
      monthlyMap[item._id] += item.points;
    });
  };

  mergePoints(postPoints);
  mergePoints(clickPoints);
  mergePoints(likePoints);

  const result = Object.entries(monthlyMap).map(
    ([dealer_id, monthly_point]) => ({
      dealer_id,
      monthly_point,
    })
  );

  const sortedResult = result.sort((a, b) => b.monthly_point - a.monthly_point);

  if (sortedResult.length > 0) {
    const dealerIds = sortedResult.map((d) => d.dealer_id);
    const usersData = await users_collection
      .find({ user_id: { $in: dealerIds } })
      .toArray();

    const mappedResult = usersData.map((user) => {
      const pointObj = sortedResult.find((r) => r.dealer_id === user.user_id);
      return {
        ...user,
        monthly_point: pointObj?.monthly_point || 0,
      };
    });

    const top20 = mappedResult
      .sort((a, b) => b.monthly_point - a.monthly_point)
      .slice(0, 20);

    return res.send(top20);
  } else {
    return res.send([]);
  }
});

// app.get("/operation", async (req, res) => {
//   const client = await dbConnect();
//   const db = client.db(db_database.deal_bondhu_database);
//   const products_collection = db.collection(db_collections.liked_products);
//   const result = await products_collection.updateMany(
//     { dealer_id: { $exists: false } },
//     {
//       $set: {
//         dealer_id: "44703a77-45ce-4478-948c-6d22a11dbf7e",
//       },
//     }
//   );
//   return res.send(result);
// });

// using routes
app.use("/users", users);

app.listen(PORT, () => {
  console.log("app is running on port");
});
