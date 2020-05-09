const path = require("path");

module.exports = {
  entry: "./lib/main-browser-standalone.js",
  output: {
    path: path.resolve(__dirname),
    filename: "build/vanillin.bundle.js"
  },
  resolve: {
    modules: ["node_modules", "build"]
  }
};
