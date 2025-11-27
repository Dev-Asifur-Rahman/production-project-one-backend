require("dotenv").config();

// route files
const users = require("./routes/users.js");

const express = require("express");
const cors = require("cors");
const user_agent = require("useragent");

// const { connectDb } = require('./config/mongodb.js');
const getLookUp = require("./config/lookupDbLoad");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.set("trust proxy", true);

// connectDb()

app.get("/", async (req, res) => {
  res.send("Deal Bondhu Backend Server is Running");
});

app.get("/track-user", async (req, res) => {
  const agent = user_agent.parse(req.headers["user-agent"]);
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket.remoteAddress ||
    req.ip;

  const lookup = await getLookUp();
  const geo = lookup.get(ip) || {};
  res.send({ agent, geo, ip });
});

app.get("/post-track-info", async (req, res) => {
  res.send("Post Track Info");
});

// using routes
app.use("/users", users);

app.listen(PORT, () => {
  console.log("app is running on port");
});
