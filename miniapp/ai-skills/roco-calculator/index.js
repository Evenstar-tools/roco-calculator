/* global wx */
const { searchRocoData, calculateRocoDamage } = require("./utils/engine.js");

// Older WeChat hosts keep the ordinary calculator; they do not run this package.
if (typeof wx !== "undefined" && typeof wx.modelContext?.registerAPI === "function") {
  wx.modelContext.registerAPI("searchRocoData", searchRocoData);
  wx.modelContext.registerAPI("calculateRocoDamage", calculateRocoDamage);
}
