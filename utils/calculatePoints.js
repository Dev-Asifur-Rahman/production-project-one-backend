
const { connectDb, databases, collections } = require("../config/mongodb");

const pointCategoryObject = { post: "post", click: "click", like: "like" };

const levels = [
  { level: "Bronze", title: "New Contributor", minPoints: 0 },
  { level: "Silver", title: "Silver Dealer", minPoints: 501 },
  { level: "Gold", title: "Gold Hunter", minPoints: 2001 },
  { level: "Platinum", title: "Platinum Expert", minPoints: 5001 },
  { level: "Diamond", title: "Diamond Elite", minPoints: 10000 },
];

const updateLevelBadgeTitle = async (id, total_points) => {
  const client = await connectDb();
  const db = client.db(databases.deal_bondhu);
  const users_collection = db.collection(collections.users);

  let newLevel = levels[0];
  for (const l of levels) {
    if (total_points >= l.minPoints) newLevel = l;
  }

  const user = await users_collection.findOne({ user_id: id });

  if (user && user.level !== newLevel.level) {
    await users_collection.updateOne(
      { user_id: id },
      {
        $set: { level: newLevel.level, title: newLevel.title },
        $addToSet: { badges_earned: newLevel.level },
      }
    );
  }
};

const calculatePoints = async (type, id) => {
  const client = await connectDb();
  const db = client.db(databases.deal_bondhu);
  const users_collection = db.collection(collections.users);

  const pointsToAdd =
    type === "post" ? 50 : type === "click" ? 5 : type === "like" ? 10 : 0;

  await users_collection.updateOne(
    { user_id: id },
    { $inc: { points: pointsToAdd } }
  );

  const user = await users_collection.findOne({ user_id: id });

  if (user) {
    await updateLevelBadgeTitle(user?.user_id, user?.points);
  }

  const updated_user = await users_collection.findOne({ user_id: id });
  return updated_user;
};

module.exports = { calculatePoints, pointCategoryObject };
