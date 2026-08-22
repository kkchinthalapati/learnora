const { acceptsMarkdown, homeHtml, markdownHome } = require("./_site-content");

module.exports = (req, res) => {
  const markdown = acceptsMarkdown(req.headers.accept);
  res.setHeader("Vary", "Accept, Accept-Encoding");
  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  res.status(200).setHeader("Content-Type", markdown ? "text/markdown; charset=utf-8" : "text/html; charset=utf-8");
  res.send(markdown ? markdownHome : homeHtml());
};
