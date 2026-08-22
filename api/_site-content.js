// The leading underscore keeps this shared module out of Vercel's public
// function routes while allowing each public handler to bundle it.
const SITE_URL = "https://learnora-app.vercel.app";
const SUPPORT_EMAIL = "support@learnora.app";

const productDescription =
  "Learnora is an AI-assisted study workspace that helps students organize subjects, tasks, revision materials, focus sessions, mock exams, flashcards, and weekly study plans in one calm, practical place.";

const markdownHome = `# Learnora — AI study workspace

${productDescription}

## What Learnora helps with

- Organize subjects, tasks, files, notes, flashcards, and quizzes.
- Build a realistic weekly study plan around your deadlines and available time.
- Run focus timers and keep a record of completed study sessions.
- Create revision material and ask the built-in study assistant for explanations, summaries, and practice questions.
- Prepare with mock exams and review the results afterward.

## Get started

Open [the Learnora study app](${SITE_URL}/app/) to sign in or create an account. Read [About Learnora](${SITE_URL}/about), [Privacy](${SITE_URL}/privacy), [Terms](${SITE_URL}/terms.html), or [developer resources](${SITE_URL}/developers).

## For AI agents

Read [llms.txt](${SITE_URL}/llms.txt) for use cases, public API and MCP details. The public MCP endpoint is ${SITE_URL}/api/mcp; its discovery record is ${SITE_URL}/.well-known/mcp. Learnora does not expose student accounts or study data through an unauthenticated public API.`;

const organizationSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "Learnora",
      applicationCategory: "EducationalApplication",
      operatingSystem: "Web",
      url: SITE_URL,
      image: `${SITE_URL}/learnora.jpg`,
      description: productDescription,
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Learnora AI Study Planner",
      url: SITE_URL,
      logo: `${SITE_URL}/learnora.jpg`,
      description: productDescription,
      contactPoint: {
        "@type": "ContactPoint",
        email: SUPPORT_EMAIL,
        contactType: "customer support",
        availableLanguage: "English",
      },
      address: {
        "@type": "PostalAddress",
        addressCountry: "IN",
      },
    },
  ],
};

function pageHtml({ title, description, canonicalPath, body, schema = null }) {
  const canonical = `${SITE_URL}${canonicalPath}`;
  const jsonLd = schema
    ? `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${description}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${SITE_URL}/learnora.jpg">
  <meta name="twitter:card" content="summary">
  <title>${title}</title>
  <link rel="icon" href="/learnora.jpg" type="image/jpeg">
  <style>
    :root { color-scheme: dark; --bg:#0a0e0d; --surface:#121a18; --line:#2a3b37; --text:#edf7f3; --muted:#a7bbb5; --accent:#76d7b0; }
    * { box-sizing:border-box; } body { margin:0; background:radial-gradient(circle at 10% 0,#173d34,transparent 30rem),var(--bg); color:var(--text); font:16px/1.65 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    .wrap { width:min(100% - 2rem, 72rem); margin:auto; } header { border-bottom:1px solid var(--line); } nav { min-height:4.5rem; display:flex; align-items:center; justify-content:space-between; gap:1rem; } .brand { color:var(--text); font-weight:800; font-size:1.25rem; text-decoration:none; } .brand span { color:var(--accent); } a { color:#9fe9cb; } .nav-link,.button { border:1px solid var(--accent); border-radius:999px; padding:.6rem 1rem; color:#07110e; background:var(--accent); font-weight:700; text-decoration:none; white-space:nowrap; } main { padding:4rem 0; } .eyebrow { color:var(--accent); font-weight:750; letter-spacing:.06em; text-transform:uppercase; font-size:.8rem; } h1 { max-width:18ch; font-size:clamp(2.4rem,7vw,4.7rem); line-height:1.05; letter-spacing:-.045em; margin:.3rem 0 1.25rem; } h2 { margin-top:3rem; font-size:1.5rem; } h3 { margin-bottom:.25rem; } .lede { max-width:48rem; color:var(--muted); font-size:1.18rem; } .actions { display:flex; flex-wrap:wrap; gap:.8rem; margin:2rem 0 3.5rem; } .secondary { color:var(--text); background:transparent; border-color:var(--line); } .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(15rem,1fr)); gap:1rem; } .card { padding:1.3rem; border:1px solid var(--line); border-radius:1rem; background:color-mix(in srgb,var(--surface) 86%,transparent); } .card p, footer, .muted { color:var(--muted); } footer { padding:2rem 0 3rem; border-top:1px solid var(--line); font-size:.92rem; } @media (max-width:34rem) { nav { align-items:flex-start; padding:1rem 0; } main { padding:2.5rem 0; } }
  </style>
  ${jsonLd}
</head>
<body>
  <header><nav class="wrap"><a class="brand" href="/">Learn<span>ora</span></a><a class="nav-link" href="/app/">Open study app</a></nav></header>
  ${body}
  <footer><div class="wrap">Learnora AI Study Planner · <a href="/about">About</a> · <a href="/contact">Contact</a> · <a href="/privacy">Privacy</a> · <a href="/terms.html">Terms</a> · <a href="/llms.txt">Agent guide</a></div></footer>
</body>
</html>`;
}

function homeHtml() {
  return pageHtml({
    title: "Learnora | AI study planner and workspace",
    description: productDescription,
    canonicalPath: "/",
    schema: organizationSchema,
    body: `<main class="wrap">
      <p class="eyebrow">Learnora AI Study Planner</p>
      <h1>Make every study session easier to start and easier to finish.</h1>
      <p class="lede">${productDescription} Learnora gives students one focused workspace for planning, studying, and revising without spreading their academic life across disconnected tools.</p>
      <div class="actions"><a class="button" href="/app/">Start studying</a><a class="button secondary" href="/about">How Learnora works</a></div>
      <section aria-labelledby="planning"><h2 id="planning">A complete study workflow</h2><div class="grid">
        <article class="card"><h3>Plan with context</h3><p>Bring together assignments, exams, subjects, and available time. Learnora can turn those details into a practical weekly study plan you can adjust as life changes.</p></article>
        <article class="card"><h3>Study in one place</h3><p>Keep course materials, notes, tasks, focus timers, flashcards, and quizzes close to the work. A single workspace means less setup before every revision session.</p></article>
        <article class="card"><h3>Learn actively</h3><p>Use the study assistant to explain a topic, generate practice material, summarize source content, or turn notes into revision prompts. Review with mock exams and track what you complete.</p></article>
      </div></section>
      <section aria-labelledby="privacy"><h2 id="privacy">Built for real students</h2><p class="lede">Learnora is an educational tool, not a promise of academic results. It is designed to support a student’s own judgement, textbooks, and course requirements. Student accounts are private; the public developer resources describe only safe, unauthenticated product information.</p></section>
      <section aria-labelledby="resources"><h2 id="resources">Resources</h2><p>Read <a href="/about">about Learnora</a>, find support on the <a href="/contact">contact page</a>, review the <a href="/privacy">privacy notice</a>, or see the <a href="/developers">Learnora developer resources</a>. AI agents can begin at <a href="/llms.txt">llms.txt</a>.</p></section>
    </main>`,
  });
}

function notFoundMarkdown() {
  return `# 404 — Page not found

This Learnora URL does not exist.

- Start at [Learnora home](${SITE_URL}/)
- Open the [study app](${SITE_URL}/app/)
- Read the [site map](${SITE_URL}/sitemap.xml)
- Read [agent and developer guidance](${SITE_URL}/llms.txt)
`;
}

function notFoundHtml() {
  return pageHtml({
    title: "404 — Page not found | Learnora",
    description: "The requested Learnora page does not exist.",
    canonicalPath: "/404",
    body: `<main class="wrap"><p class="eyebrow">Error 404</p><h1>That Learnora page does not exist.</h1><p class="lede">The address may be outdated or misspelled. You can recover from the links below.</p><div class="actions"><a class="button" href="/">Learnora home</a><a class="button secondary" href="/app/">Open study app</a></div><section><h2>Where to look next</h2><p>Browse the <a href="/sitemap.xml">XML sitemap</a>, read <a href="/llms.txt">agent guidance</a>, or visit <a href="/developers">developer resources</a>.</p></section></main>`,
  });
}

function acceptsMarkdown(acceptHeader = "") {
  return acceptHeader.split(",").some((value) => {
    const [type, ...parameters] = value.trim().toLowerCase().split(";");
    const disabled = parameters.some((parameter) => /^q\s*=\s*0(?:\.0+)?$/.test(parameter.trim()));
    return !disabled && (type === "text/markdown" || type === "text/x-markdown");
  });
}

function publicProductInfo() {
  return {
    name: "Learnora",
    description: productDescription,
    url: SITE_URL,
    applicationUrl: `${SITE_URL}/app/`,
    developerDocumentation: `${SITE_URL}/developers`,
    llms: `${SITE_URL}/llms.txt`,
    openapi: `${SITE_URL}/openapi.json`,
    mcp: `${SITE_URL}/api/mcp`,
    mcpDiscovery: `${SITE_URL}/.well-known/mcp`,
    support: `mailto:${SUPPORT_EMAIL}`,
    publicApiScope: "Read-only product information. Student accounts and study data require an authenticated in-product session and are not available through this public API.",
  };
}

module.exports = {
  SITE_URL,
  SUPPORT_EMAIL,
  acceptsMarkdown,
  homeHtml,
  markdownHome,
  notFoundHtml,
  notFoundMarkdown,
  publicProductInfo,
};
