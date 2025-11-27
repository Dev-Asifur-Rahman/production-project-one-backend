const maxmind = require("maxmind");
const path = require("path");

let lookupPromise;

const getLookup = () => {
  if (!lookupPromise) {
    lookupPromise = maxmind.open(
      path.join(__dirname, "../db/GeoLite2-City.mmdb")
    );
  }
  return lookupPromise;
};

module.exports = getLookup;
