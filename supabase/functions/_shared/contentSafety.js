/* =========================================================================
   CONTENT SAFETY — shared by learnora-ai and web-research.

   Learnora is a study tool used by students from age 13. Two gaps let it
   generate a quiz on bomb-making and one on recreational drug identification:
   the system prompt said nothing about acceptable subject matter, and a
   Gemini safety refusal was caught as a generic error and silently retried
   against Groq/OpenRouter, which are far less filtered. So a blocked request
   didn't fail — it got downgraded to a provider that would answer it.

   The screen below is deliberately narrow. It targets operational
   "how to make/obtain" framing rather than subject areas, because banning
   topics outright would break legitimate coursework: pharmacology, the
   chemistry of energetic materials, military history, and toxicology are all
   things a student may properly be studying. The system-prompt policy and the
   provider filters cover the grey zone; this catches the blatant cases before
   a single token is spent.

   Plain JavaScript rather than TypeScript so the Deno functions and the Node
   tests (tests/safety.test.js) import the same file with no build step.
   ========================================================================= */

export const SAFETY_REFUSAL =
  "I can't help with that topic. Learnora is a study assistant — I can't create quizzes or study material about making weapons or explosives, obtaining or producing illegal drugs, or harming yourself or others. Ask me about a subject you're studying and I'll gladly help.";

/* A student asking how to hurt themselves needs a person, not a prompt to
   get back to revision. Numbers are for the regions Learnora's languages
   cover most; findahelpline.com covers the rest. */
export const SELF_HARM_REFUSAL =
  "I can't help with that, but it sounds like things might be really hard right now, and I'm glad you said something. You don't have to handle this alone. Please talk to someone you trust today — a parent, a teacher, or a school counsellor. If you might be in danger right now, call your local emergency number. In the US you can call or text 988, in the UK and Ireland you can call Samaritans on 116 123, and findahelpline.com lists free, confidential helplines in other countries.";

// Street drugs whose chemistry is off-limits. Kept to recreational drugs
// with no everyday study use — prescription drugs and alcohol stay out.
const ILLICIT_DRUGS =
  "meth|methamphetamines?|crystal\\s*meth|cocaine|crack\\s*cocaine|heroin|fentanyl|carfentanil|mdma|ecstasy|lsd|ghb|pcp|angel\\s*dust|mephedrone|krokodil|desomorphine";

const DRUG_CHEMISTRY_TERMS =
  "formula[es]?|chemical\\s*structure|molecular\\s*structure|structural\\s*formula|ingredients?|precursors?|reagents?|recipe|chemicals?\\s+(?:(?:are|is)\\s+)?(?:in|used|needed|required|for)|synthesis|synthesi[sz]e|purify";

// Kept apart from the rest so a hit can be answered with crisis resources
// instead of the general refusal.
// "Lethal dose of …" is a question worth refusing, but a sentence any
// pharmacology page contains — so reference text is screened without it.
const LETHAL_DOSE = /\b(?:lethal|fatal)\s*dose\b[^.?!]{0,30}\b(?:of|for)\b/i;
const SELF_HARM_PATTERNS = [
  /\b(?:how\s*to|best\s*way|method[s]?\s*(?:to|for|of))\b[^.?!]{0,30}\b(?:kill\s*(?:myself|yourself)|commit\s*suicide|suicide|self[\s-]?harm|end\s*my\s*life|overdose)\b/i,
  LETHAL_DOSE,
];

const UNSAFE_PATTERNS = [
  // Weapons and explosives — construction/acquisition framing only.
  /\b(?:make|making|build|building|construct|constructing|create|creating|assemble|assembling|manufacture|manufacturing|diy|homemade|improvised)\b[^.?!]{0,40}\b(?:bomb|explosive|ied|grenade|landmine|napalm|thermite|pipe\s*bomb|molotov|detonator|silencer|suppressor|ghost\s*gun|untraceable\s*(?:gun|firearm))/i,
  /\b(?:bomb|explosive|grenade|napalm|thermite|detonator)[\s-]*(?:making|building|construction|recipe|blueprint)\b/i,
  /\b(?:3d[\s-]?print|print)\w*\b[^.?!]{0,30}\b(?:gun|firearm|receiver|lower)\b/i,
  /\bconvert\w*\b[^.?!]{0,30}\bfull[\s-]?auto\b/i,

  // Illegal drug synthesis or acquisition.
  /\b(?:synthes\w+|cook|cooking|manufactur\w+|produc\w+|extract\w+|grow\w+|make|making)\b[^.?!]{0,40}\b(?:meth|methamphetamine|crystal\s*meth|cocaine|crack|heroin|fentanyl|mdma|ecstasy|lsd|ghb|psilocybin|magic\s*mushrooms)\b/i,
  /\b(?:how|where)\b[^.?!]{0,30}\b(?:buy|score|obtain|get)\b[^.?!]{0,30}\b(?:meth|cocaine|heroin|fentanyl|mdma|ecstasy|lsd|illegal\s*drugs|drugs\s*online)\b/i,
  /\bdark\s*(?:web|net)\b[^.?!]{0,30}\b(?:drug|gun|weapon)/i,
  // Chemistry framing of a street drug, with no "make" verb needed — the
  // formula, structure, ingredients or precursors of meth is the first step
  // of a recipe, not coursework. (Drug policy, addiction and public health
  // stay open: none of them name a street drug alongside these words.)
  new RegExp(`\\b(?:${DRUG_CHEMISTRY_TERMS})\\b[^.?!]{0,40}\\b(?:${ILLICIT_DRUGS})\\b`, "i"),
  new RegExp(`\\b(?:${ILLICIT_DRUGS})\\b[^.?!]{0,40}\\b(?:${DRUG_CHEMISTRY_TERMS})\\b`, "i"),
  new RegExp(`\\bwhat(?:'s|\\s+is|\\s+are)?\\b[^.?!]{0,15}\\b(?:${ILLICIT_DRUGS})\\b[^.?!]{0,15}\\b(?:made|cooked|produced)\\s+(?:of|from|with)\\b`, "i"),
  new RegExp(`\\bwhat(?:'s|\\s+is)\\s+in\\s+(?:${ILLICIT_DRUGS})\\b`, "i"),
  // Named meth precursors and routes — no study context uses these together.
  /\b(?:pseudo)?ephedrine\b[^.?!]{0,40}\b(?:reduc\w+|extract\w+|convert\w+|into\s+meth)/i,
  /\b(?:reduc\w+|extract\w+|convert\w+)\b[^.?!]{0,20}\b(?:pseudo)?ephedrine\b/i,
  /\b(?:shake\s*(?:and|&|n)\s*bake|one[\s-]?pot)\s*meth\b/i,
  /\b(?:red\s*phosphorus|p2p|phenyl-?2-?propanone|birch\s*reduction)\b[^.?!]{0,40}\b(?:meth|methamphetamine|amphetamine)\b/i,

  // Self-harm and suicide methods.
  ...SELF_HARM_PATTERNS,

  // Poisons/toxins framed as untraceable harm to a person.
  /\b(?:poison|toxin|nerve\s*agent|ricin|sarin|anthrax)\b[^.?!]{0,40}\b(?:someone|a\s*person|undetect\w+|untraceab\w+|without\s*(?:being\s*)?(?:caught|detected))/i,

  // Sexual content involving minors — no legitimate study framing.
  /\b(?:child|minor|underage|teen|preteen|loli)\w*\b[^.?!]{0,25}\b(?:porn|sexual|erotic|nude|nudes|nsfw)\b/i,
  /\b(?:porn|sexual|erotic|nude|nsfw)\w*\b[^.?!]{0,25}\b(?:child|minor|underage|preteen)\b/i,
];

/* ── Obfuscation ─────────────────────────────────────────────────────────
   Word matching is only as good as the words it sees. Each of these got
   "how to make a bomb" past the screen: b-o-m-b, b.o.m.b, b0mb, bómb, a
   zero-width space inside the word, full-width letters, and Cyrillic
   look-alikes. */

// Zero-width and invisible formatting characters, plus the soft hyphen.
const INVISIBLE = /[­᠎​-‏‪-‮⁠-⁤﻿]/g;
// Characters picked apart one at a time: "b-o-m-b", "b.o.m.b", "b/o/m/b".
const SPELLED_OUT = /\b[a-z0-9](?:[-./|+][a-z0-9]\b){2,}/gi;
// The same with spaces ("b o m b"). A run may not start on "a" or "I", or
// "make a b o m b" would collapse into "abomb" and miss the word boundary.
const SPACED_OUT = /\b(?![ai]\s)[a-z0-9](?:\s[a-z0-9]\b){2,}/gi;
// Cyrillic and Greek letters that render identically to Latin ones.
const LOOKALIKES = {
  "а": "a", "в": "b", "е": "e", "к": "k", "м": "m", "н": "h", "о": "o", "р": "p",
  "с": "c", "т": "t", "у": "y", "х": "x", "і": "i", "ј": "j", "ѕ": "s",
  "α": "a", "β": "b", "ε": "e", "ι": "i", "κ": "k", "ν": "v", "ο": "o", "ρ": "p", "τ": "t", "υ": "u",
};
const LOOKALIKE_CHARS = new RegExp(`[${Object.keys(LOOKALIKES).join("")}]`, "gi");
const LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s" };
// Only words that mix letters with look-alike digits or symbols ("b0mb"),
// so plain numbers and chemical formulas are left alone.
const LEET_WORD = /[a-z0-9@$]*[a-z][a-z0-9@$]*/gi;

function baseNormalize(text) {
  return text
    .normalize("NFKD") // full-width letters → ASCII; "é" → "e" + combining mark
    .replace(/[̀-ͯ]/g, "") // …and the combining mark goes
    .replace(INVISIBLE, "")
    .replace(/[_*~`]+/g, "")
    .replace(/\s{2,}/g, " ");
}

function deobfuscate(text) {
  return text
    .replace(LOOKALIKE_CHARS, (c) => LOOKALIKES[c.toLowerCase()] ?? c)
    .replace(SPELLED_OUT, (run) => run.replace(/[-./|+]/g, ""))
    .replace(SPACED_OUT, (run) => run.replace(/\s/g, ""))
    .replace(LEET_WORD, (word) =>
      /[0-9@$]/.test(word) ? word.replace(/[0-9@$]/g, (c) => LEET[c] ?? c) : word
    );
}

/* Every pattern is tried against the text as written and against its
   decoded form. Both are needed: decoding turns "3d print" into "ed print",
   so a match that only held on the original must still count. */
function variants(text) {
  const base = baseNormalize(text);
  const decoded = deobfuscate(base);
  return decoded === base ? [base] : [base, decoded];
}

function matchesAny(patterns, text) {
  if (!text || typeof text !== "string") return false;
  const forms = variants(text);
  return patterns.some((re) => forms.some((form) => re.test(form)));
}

export function screenForUnsafeContent(text) {
  return matchesAny(UNSAFE_PATTERNS, text);
}

const REFERENCE_PATTERNS = UNSAFE_PATTERNS.filter((re) => re !== LETHAL_DOSE);

/* For material a student imports rather than asks — a web page. Same screen
   minus the one pattern that matches ordinary textbook sentences. */
export function screenReferenceText(text) {
  return matchesAny(REFERENCE_PATTERNS, text);
}

export function isSelfHarmContent(text) {
  return matchesAny(SELF_HARM_PATTERNS, text);
}

const DRUG_MENTION = new RegExp(`\\b(?:${ILLICIT_DRUGS})\\b`, "i");
const RECIPE_FOLLOW_UP = new RegExp(
  `\\b(?:formula[es]?|structure|ingredients?|precursors?|reagents?|recipe|chemicals?\\s+(?:(?:are|is)\\s+)?(?:in|used|needed|required|for)|synthes\\w+|cook\\w*|manufactur\\w+|produc\\w+|extract\\w+|made\\s+(?:of|from|with)|make|buy|obtain|step[\\s-]*by[\\s-]*step)\\b`,
  "i",
);
// The follow-up has to point back at something ("synthesise it", "what's in
// that") — a fresh question about an unrelated lab is not a follow-up.
const BACK_REFERENCE = /\b(?:it|its|it's|that|this|them|those|these|the\s+drug|some)\b/i;
// Workspace context and pasted notes also travel as user turns; those are
// long, and a drug named in a student's notes shouldn't taint every later
// question, so only short conversational turns count as the earlier topic.
const MAX_TOPIC_TURN_CHARS = 400;
const TOPIC_LOOKBACK_TURNS = 3;

/* Screens the newest turn, plus the case the single-turn screen can't see:
   a drug named in one message and the recipe asked for in the next ("chemical
   formula of meth" → "what ingredients are used to synthesise it?"). */
export function screenConversation(history) {
  if (!Array.isArray(history) || history.length === 0) return false;
  const current = history[history.length - 1]?.content;
  if (typeof current !== "string") return false;
  if (screenForUnsafeContent(current)) return true;
  if (!RECIPE_FOLLOW_UP.test(current) || !BACK_REFERENCE.test(current)) return false;
  return history
    .slice(0, -1)
    .filter((m) => m?.role === "user" && typeof m.content === "string" && m.content.length <= MAX_TOPIC_TURN_CHARS)
    .slice(-TOPIC_LOOKBACK_TURNS)
    .some((m) => matchesAny([DRUG_MENTION], m.content));
}

/* ── Web research ────────────────────────────────────────────────────────
   Live search reaches the whole web, so pornography needs screening there
   even though the chat screen leaves sexual health and sex education to the
   system prompt. These terms have no study use at 13, unlike "sex", "nude"
   (art history) or "Essex". */
const ADULT_TERMS = /\b(?:porn\w*|\w+porn|xxx+|hentai|nsfw|onlyfans|erotica|camgirls?|sexcams?|escort\s+services?)\b/i;
const ADULT_TLDS = new Set(["xxx", "porn", "adult", "sex", "sexy"]);

export function isAdultContent(text) {
  return matchesAny([ADULT_TERMS], text);
}

/* A whole page gets more room: an article on internet safety may say
   "porn" once or twice, an adult site says it constantly. */
const ADULT_PAGE_MIN_HITS = 3;
const ADULT_TERMS_GLOBAL = new RegExp(ADULT_TERMS.source, "gi");

export function isAdultPage(title, body) {
  if (isAdultContent(title)) return true;
  if (!body || typeof body !== "string") return false;
  return (baseNormalize(body).match(ADULT_TERMS_GLOBAL) || []).length >= ADULT_PAGE_MIN_HITS;
}

/* Hostnames are checked label by label ("pornhub", "youporn"), so a
   university in Essex or Sussex is not caught by a substring match. */
export function isAdultUrl(raw) {
  let host;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return false;
  }
  const labels = host.split(".");
  if (ADULT_TLDS.has(labels[labels.length - 1])) return true;
  return labels.some((label) => label.split("-").some((part) => ADULT_TERMS.test(part)));
}
