/* Imported for its side effect, before anything that loads @openuidev/*.
 *
 * zod decides per schema, when the schema is created, whether to compile a
 * fast path with `new Function`; the first parse then probes eval. The app's
 * CSP has no 'unsafe-eval', so the probe fails (caught) but the browser logs
 * a CSP violation on every page with a card (audit 2026-11-07 F-12). The
 * OpenUI packages build schemas as they load, so the setting has to be in
 * place before their modules run: setting it later in library.tsx left
 * those schemas on the JIT path. Parsing is the same either way. */
import { config } from "zod/v4/core";

config({ jitless: true });
