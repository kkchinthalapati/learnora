/* "Generate image" in the chat — a labelled diagram drawn on request.
 *
 * The edge function's `mode: "image"` path does the work (its own provider
 * list, never the text chain; see supabase/functions/learnora-ai/index.ts):
 * it screens the description, generates the picture, stores it in the
 * private `chat-media` bucket under the student's id, and returns only the
 * storage key. The key is what the chat keeps; the picture is read back
 * through a short-lived signed URL, like card images and materials.
 */

import { AiError, callEdge } from "./ai";
import { decksApi } from "./decks";
import { flashcardsApi } from "./flashcards";
import { supabase } from "../lib/supabase";
import { formatMonthDay } from "../lib/date";
import type { Settings } from "../lib/settings";

export const CHAT_MEDIA_BUCKET = "chat-media";

/** Mirrors MAX_IMAGE_PROMPT_CHARS in the edge function, which cuts there. */
export const MAX_IMAGE_DESCRIPTION = 500;

export interface GeneratedImage {
  /** Storage key in `chat-media` — never a URL, never the bytes. */
  path: string;
  alt: string;
  /** What the student asked for, kept for the flashcard it may become. */
  prompt: string;
}

/** Generates and stores one picture. Throws `AiError` — with `refused` set
 *  when the description or the image model said no, so the caller can show
 *  that sentence as the reply rather than as a failure to retry. */
export async function generateImage(
  description: string,
  settings: Settings,
  signal?: AbortSignal,
): Promise<GeneratedImage> {
  const prompt = description.trim().slice(0, MAX_IMAGE_DESCRIPTION);
  if (!prompt) {
    throw new AiError("Describe the picture you want first.", { retryable: false });
  }

  /* No client retry: the server has already walked every image provider,
     and a second pass is another minute of waiting for the same answer. */
  const result = await callEdge(
    {
      history: [{ role: "user", content: prompt }],
      mode: "image",
      tool: "image",
      settings,
    },
    undefined,
    0,
    signal,
  );

  if (result.refused) {
    throw new AiError(result.text, { refused: true, retryable: false });
  }
  if (!result.imagePath) {
    throw new AiError("Couldn't draw that this time. Please try again in a moment.");
  }
  return { path: result.imagePath, alt: result.text || `Diagram: ${prompt}`, prompt };
}

/** A signed URL for a generated picture. `download` names the saved file and
 *  makes Storage serve it as an attachment rather than inline. */
export async function getChatImageUrl(
  path: string,
  options: { download?: string } = {},
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(CHAT_MEDIA_BUCKET)
    .createSignedUrl(
      path,
      3600,
      options.download ? { download: options.download } : undefined,
    );
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

/** Title of the deck saved diagrams go into — one per day, so a session of
 *  diagrams lands together instead of as a deck each. */
export function chatDiagramDeckTitle(now: Date = new Date()): string {
  return `Chat diagrams — ${formatMonthDay(now)}`;
}

/** Turns a generated picture into a flashcard: the picture on the front,
 *  what it shows on the back. The image is copied into `card-media`, the
 *  bucket card images are read from, so deleting the chat never breaks the
 *  card. Resolves with the deck id. */
export async function saveImageAsFlashcard(image: GeneratedImage): Promise<string> {
  const { data: blob, error } = await supabase.storage
    .from(CHAT_MEDIA_BUCKET)
    .download(image.path);
  if (error || !blob) throw new Error("Couldn't fetch that picture to save it.");

  const ext = image.path.split(".").pop()?.toLowerCase() || "png";
  const type = blob.type || (ext === "jpg" ? "image/jpeg" : `image/${ext}`);
  const cardImagePath = await flashcardsApi.uploadImage(
    new File([blob], `diagram.${ext}`, { type }),
  );

  const title = chatDiagramDeckTitle();
  const existing = (await decksApi.fetchAll()).find((deck) => deck.title === title);
  const deck = existing ?? (await decksApi.add(null, title));
  await flashcardsApi.add(deck.id, {
    front: "What does this diagram show? Name the labelled parts.",
    back: image.prompt,
    frontImagePath: cardImagePath,
  });
  return deck.id;
}
