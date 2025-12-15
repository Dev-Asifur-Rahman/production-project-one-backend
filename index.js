require("dotenv").config();

// route files
const users = require("./routes/users.js");

const express = require("express");
const cors = require("cors");
const user_agent = require("useragent");

const getLookUp = require("./config/lookupDbLoad");
const { connectDb, databases, collections } = require("./config/mongodb.js");
const { ObjectId } = require("mongodb");
const {
  dbConnect,
  db_database,
  db_collections,
} = require("./config/dealBondhuDB.js");
const archiveChecker = require("./middleware/archiveChecker.js");
const archive_product_delete = require("./middleware/archiveProductDelete.js");

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

app.get("/admin_get_products", async (req, res) => {
  const client = await connectDb();
  const db = client.db(databases.deal_bondhu);
  const product_collection = db.collection(collections.products);
  const result = await product_collection.find({}).toArray();
  res.send(result);
});

app.get("/admin_get_product/:id", async (req, res) => {
  const { id } = req.params;

  const client = await connectDb();
  const db = client.db(databases.deal_bondhu);
  const product_collection = db.collection(collections.products);

  const product = await product_collection.findOne({ _id: new ObjectId(id) });

  res.send(product);
});

app.post("/archive_existing_product/:id", async (req, res) => {
  const { id } = req.params;
  const client = await connectDb();
  const db_client = await dbConnect();

  const db = client.db(databases.deal_bondhu);
  const db_db = db_client.db(db_database.deal_bondhu_database);

  const product_collection = db.collection(collections.products);
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

  const client = await connectDb();
  const db = client.db(databases.deal_bondhu);
  const product_collection = db.collection(collections.products);

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
  const db_client = await dbConnect();

  const db = client.db(databases.deal_bondhu);
  const db_db = db_client.db(db_database.deal_bondhu_database);

  const product_collection = db.collection(collections.products);
  const liked_collection = db.collection(collections.liked_products);
  const clicked_collection = db.collection(collections.clicked_products);
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
    isSaved
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

app.post("/approve_pending_product/:id", async (req, res) => {
  const { id } = req.params;

  const client = await connectDb();
  const db_client = await dbConnect();

  const db = client.db(databases.deal_bondhu);
  const db_db = db_client.db(db_database.deal_bondhu_database);

  const product_collection = db.collection(collections.products);
  const pending_product_collection = db_db.collection(
    db_collections.pending_products
  );

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
    return res.send(result);
  } else {
    return { success: false, message: "product not found" };
  }
});

// get all clicks by last one month (just for you)
app.post("/recent_clicks", archiveChecker, async (req, res) => {
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
    const result = await product_collection
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
  const clicked_product_collection = db.collection(
    collections.clicked_products
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

app.get("/banners", async (req, res) => {
  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const banner_collections = db.collection(db_collections.banners);

  const result = await banner_collections.find({}).toArray();
  res.send(result);
});

app.post("/upload_banner", async (req, res) => {
  const object = req.body;

  const client = await dbConnect();
  const db = client.db(db_database.deal_bondhu_database);
  const banner_collections = db.collection(db_collections.banners);

  const banner = {
    ...object,
    created_at: new Date(),
  };

  const result = await banner_collections.insertOne(banner);
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

// using routes
app.use("/users", users);

app.listen(PORT, () => {
  console.log("app is running on port");
});
