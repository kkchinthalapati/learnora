const { publicProductInfo } = require("./_site-content");

module.exports = (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).json(publicProductInfo());
};
