/* Ports `renderMarkdown` out of js/ai.js:138-192 — early, ahead of the rest
 * of that file (ledger step 14), because it is a pure string transform with
 * no network call and no AI dependency, and the notes editor genuinely needs
 * it today: any note whose `html_content` hasn't been generated yet (still
 * processing, or created before the `html_content` column existed — see
 * supabase/migrations/20260727020000) falls back to rendering its
 * `markdown_content`. Step 14 should import this rather than reimplement it
 * when it ports the rest of `ai.js`.
 *
 * Dropped from the port: the vanilla's comment about a widget-token
 * un-escape step that used to exist and was removed as a security fix
 * (js/ai.js:183-190, "restoreWidgets"). That machinery belongs to the AI
 * chat's action-tag system, which doesn't exist here yet — nothing calls
 * this function with reserved widget tokens today, so there is nothing to
 * preserve compatibility with. */

export function renderMarkdown(md: string | null | undefined): string {
  if (!md) return "";
  let html = md;

  // Escape HTML first.
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Fenced code blocks: ```lang\n...\n```
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_, _lang: string, code: string) => {
      return `<pre class="glass-panel" style="padding:16px; margin:16px 0; overflow-x:auto; background:rgba(0,0,0,0.4); border-radius:var(--r-md);"><code style="font-family:'Fira Code',monospace; color:#4AE283; font-size:0.9rem; line-height:1.5;">${code.trim()}</code></pre>`;
    },
  );

  // Inline code.
  html = html.replace(
    /`([^`\n]+)`/g,
    '<code style="font-family:monospace; background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px; color:var(--primary);">$1</code>',
  );

  // Headers (longest first, to avoid conflicts).
  html = html.replace(
    /^#### (.*?)$/gm,
    '<h4 style="font-size:1.15rem; margin:20px 0 8px; color:var(--text); font-weight:600;">$1</h4>',
  );
  html = html.replace(
    /^### (.*?)$/gm,
    '<h3 style="font-size:1.3rem; margin:24px 0 10px; color:var(--text); font-weight:600;">$1</h3>',
  );
  html = html.replace(
    /^## (.*?)$/gm,
    '<h2 style="font-size:1.6rem; margin:28px 0 12px; color:var(--primary); font-weight:700;">$1</h2>',
  );
  html = html.replace(
    /^# (.*?)$/gm,
    '<h1 style="font-size:2rem; margin:32px 0 16px; color:var(--primary); font-weight:800;">$1</h1>',
  );

  // Bold and italic.
  html = html.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // Blockquotes.
  html = html.replace(
    /^&gt; (.*?)$/gm,
    '<blockquote style="border-left:3px solid var(--primary); padding:8px 16px; margin:12px 0; opacity:0.85; font-style:italic;">$1</blockquote>',
  );

  // Unordered lists.
  html = html.replace(
    /^- (.*?)$/gm,
    '<li style="margin-left:20px; margin-bottom:6px; list-style-type:disc;">$1</li>',
  );

  // Numbered lists.
  html = html.replace(
    /^\d+\. (.*?)$/gm,
    '<li style="margin-left:20px; margin-bottom:6px; list-style-type:decimal;">$1</li>',
  );

  // Horizontal rules.
  html = html.replace(
    /^---$/gm,
    '<hr style="border:none; border-top:1px solid rgba(255,255,255,0.15); margin:24px 0;">',
  );

  // Newlines to <br> (not inside code blocks — already handled above).
  html = html.replace(/\n/g, "<br/>");

  return html;
}
