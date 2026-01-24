const deviceType = (browser) => {
  let device = "desktop";

  if (browser === "android") {
    device = "mobile";
  }

  return device;
};

const userVisited = (isVisited) => {
  const updateScore = isVisited ? 0 : 50
  return updateScore;
};

const deviceScore = (currentDevice, score, previousObject) => {
  let deviceUpdatedScore = score;

  //if desktop to desktop || mobile to mobile
  if (
    (previousObject.device && currentDevice === "desktop") ||
    (!previousObject.device && currentDevice === "mobile")
  ) {
    deviceUpdatedScore += 0;
  }

  // if desktop and mobile
  if (previousObject.device && currentDevice === "mobile") {
    deviceUpdatedScore -= 5;
  }

  // if mobile to desktop
  if (!previousObject.device && currentDevice === "desktop") {
    deviceUpdatedScore += 5;
  }

  return {
    deviceUpdatedScore,
    device: currentDevice === "desktop" ? true : false,
  };
};

const timeScore = (score, previousObject) => {
  let timeUpdatedScore = score;

  const hour = new Date().getHours();
  const hightIntentHour = hour >= 18 && hour <= 22 ? true : false;

  if (
    (previousObject.visit_time && hightIntentHour) ||
    (!previousObject.visit_time && !hightIntentHour)
  ) {
    timeUpdatedScore += 0;
  }

  if (!previousObject.visit_time && hightIntentHour) {
    timeUpdatedScore += 10;
  }

  if (previousObject.visit_time && !hightIntentHour) {
    timeUpdatedScore -= 10;
  }

  return { timeUpdatedScore, visit_time: hightIntentHour };
};

const locationScore = (currentCity, score, previousObject) => {
  let updateLocationScore = score;
  const currentHightIntentCity = ["Dhaka", "Chittagong"].includes(currentCity);
  const previousHightIntentCity = previousObject.location;

  if (
    (previousHightIntentCity && currentHightIntentCity) ||
    (!previousHightIntentCity && !currentHightIntentCity)
  ) {
    updateLocationScore += 0;
  }

  if (!previousHightIntentCity && currentHightIntentCity) {
    updateLocationScore += 5;
  }
  if (previousHightIntentCity && !currentHightIntentCity) {
    updateLocationScore -= 5;
  }

  return {
    updateLocationScore,
    location: currentHightIntentCity ? true : false,
  };
};

const spentTimeScore = (lastVisitedTime, score, previousObject) => {
  let updatedTimeScore = score;
  const leaveTime = new Date();
  const timeSpent = (leaveTime - lastVisitedTime) / 1000;
  const currentStayed = timeSpent > 15;

  if (
    (previousObject.time_spent && !currentStayed) ||
    (!previousObject.time_spent && currentStayed)
  ) {
    updatedTimeScore += 0;
  }
  if (!previousObject.time_spent && currentStayed) {
    updatedTimeScore += 10;
  }
  if (previousObject.time_spent && !currentStayed) {
    updatedTimeScore -= 10;
  }
  return {
    updatedTimeScore,
    timeSpent,
    leaveTime,
    time_spent: currentStayed ? true : false,
  };
};

const intentLevelCalculator = (score) => {
  let level = "low";
  if (score >= 70) {
    level = "medium";
  }
  if (score > 80) {
    level = "high";
  }
  return level
};
module.exports = {
  deviceType,
  userVisited,
  deviceScore,
  timeScore,
  locationScore,
  spentTimeScore,
  intentLevelCalculator
};
