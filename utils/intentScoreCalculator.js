const deviceType = (browser) => {
  let device = "desktop";

  if (browser === "android") {
    device = "mobile";
  }

  return device;
};

const scoreCalculator = () => {
  let score = 0;
  let level = "low";
  return { score, level };
};

module.exports = { deviceType, scoreCalculator };
