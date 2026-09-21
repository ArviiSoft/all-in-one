const path = require("node:path");
const { createJsonStore } = require("../Core/safeJsonStore");

const DEFAULT_STORE_PATH = path.join(__dirname, "../../Database/Boost/boostTracking.json");

function createBoostStore(filePath = DEFAULT_STORE_PATH, options = {}) {
  return createJsonStore(filePath, options);
}

module.exports = { createBoostStore, DEFAULT_STORE_PATH };