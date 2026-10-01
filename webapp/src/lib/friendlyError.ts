/* What a student sees when a request fails.
 *
 * The API layer throws `new Error(error.message)` with whatever PostgREST,
 * GoTrue or fetch said — "JWT expired", `relation "exams" does not exist`,
 * `duplicate key value violates unique constraint "…"`, "TimeoutError: signal
 * timed out". Those reached toasts verbatim: meaningless to a student, and a
 * small leak of schema names. Rewriting them at ~200 throw sites would be
 * churn, so error toasts pass through here instead. Messages the app wrote
 * for students (everything else) are returned unchanged. */

const SESSION = "Your session has expired. Please sign in again.";
const OFFLINE = "Couldn't reach Learnora. Check your connection and try again.";
const SLOW = "Learnora is taking too long to respond. Please try again.";
const GENERIC = "Something went wrong on our side. Please try again.";

const RULES: [RegExp, string][] = [
  [/timeouterror|timed out|signal is aborted|aborterror/i, SLOW],
  [
    /failed to fetch|networkerror|network request failed|load failed|err_internet_disconnected/i,
    OFFLINE,
  ],
  [/duplicate key value/i, "That already exists."],
  [
    /relation .* does not exist|column .* does not exist|violates (?:foreign key|check|not-null)|syntax error|permission denied for|row-level security|pgrst\d+|could not find the .* in the schema cache|invalid input syntax/i,
    GENERIC,
  ],
  [/^\{\}$|^\[object object\]$|^undefined$|^null$/i, GENERIC],
];

export function friendlyErrorMessage(message: string): string {
  const text = message.trim();
  if (!text) return GENERIC;
  // Narrower than requestErrors' isAuthError on purpose: that also matches
  // "session … not found", which would rewrite "Study session not found".
  if (/\bjwt\b|pgrst30[0-3]|refresh[\s_-]*token|auth session missing/i.test(text))
    return SESSION;
  for (const [pattern, replacement] of RULES) {
    if (pattern.test(text)) return replacement;
  }
  return text;
}
