require("dotenv").config();

// route files
const users = require("./routes/users.js");

const express = require("express");
const cors = require("cors");
const user_agent = require("useragent");

const getLookUp = require("./config/lookupDbLoad");
const { connectDb, databases, collections } = require("./config/mongodb.js");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.set("trust proxy", true);

app.get("/", async (req, res) => {
  res.send("Deal Bondhu Backend Server is Running");
});

app.get("/clicked_user_data", async (req, res) => {});

app.post("/post_track_info", async (req, res) => {
  const agent = user_agent.parse(req.headers["user-agent"]);

  const browser = agent?.family || null;

  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket.remoteAddress ||
    req.ip;

  const lookup = await getLookUp();
  const geo = lookup.get(ip) || {};

  const { product_link, company } = req.body;

  const client = await connectDb();
  const db = client.db(databases.deal_bondhu);
  const clicked_collection = db.collection(
    collections.clicked_user_info_collection
  );

  const user_clicked_info = {
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

// using routes
app.use("/users", users);

app.listen(PORT, () => {
  console.log("app is running on port");
});
