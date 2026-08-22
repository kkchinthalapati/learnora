const { acceptsMarkdown, notFoundHtml, notFoundMarkdown } = require("./_site-content");

module.exports = (req, res) => {
  const markdown = acceptsMarkdown(req.headers.accept);
  res.setHeader("Vary", "Accept, Accept-Encoding");
  res.setHeader("Cache-Control", "no-store");
  res.status(404).setHeader("Content-Type", markdown ? "text/markdown; charset=utf-8" : "text/html; charset=utf-8");
  res.send(markdown ? notFoundMarkdown() : notFoundHtml());
};
