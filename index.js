require("dotenv").config();

// route files
const users = require("./routes/users.js");

const express = require("express");
const cors = require("cors");
const maxmind = require("maxmind");
const user_agent = require("useragent");

// const { connectDb } = require('./config/mongodb.js');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.set("trust proxy", true);

// connectDb()
let lookup;

(async () => {
  try {
    lookup = await maxmind.open("./db/GeoLite2-City.mmdb");
  } catch (error) {
    console.error("Failed to load MaxMind DB:", error);
  }
})();

app.get("/", async (req, res) => {
  res.send("Deal Bondhu Backend Server is Running");
});

app.get("/track-user", async (req, res) => {
  agent = user_agent.parse(req.headers["user-agent"]);
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket.remoteAddress ||
    req.ip;
  const geo = lookup.get(ip) || {};
  res.send({ agent, geo, ip });
});

app.get('/post-track-info',async (req,res)=>{
    res.send('Post Track Info')
})

// using routes
app.use("/users", users);

app.listen(PORT, () => {
  console.log("app is running on port");
});
