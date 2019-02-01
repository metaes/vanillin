const path = require("path");

module.exports = {
  entry: "./main-browser-standalone.js",
  output: {
    path: path.resolve(__dirname),
    filename: "vanillin.bundle.js"
  }
};
