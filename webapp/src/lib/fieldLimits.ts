/* Caps for the free-text fields a student can type into, kept together so the
 * screen that creates a value and the screen that edits it agree on what is
 * allowed. They did not: Settings ▸ Account has capped a display name at 80
 * characters since the settings pass, while Sign up — where every name is
 * actually first entered — had no cap at all. A 300-character name signed up
 * fine and then could not be edited without being truncated, and in the
 * meantime it stretched every row that rendered it (friends, leaderboard,
 * study room).
 *
 * These are presentation limits, not a security boundary; the database and its
 * policies remain the real one. */

/** Display name. 80 is comfortably past any real name and short enough to sit
 *  in a leaderboard row without wrapping. */
export const NAME_MAX = 80;

/** Profile bio. */
export const BIO_MAX = 280;
