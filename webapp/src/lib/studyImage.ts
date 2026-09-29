/* =========================================================================
   STUDY PHOTOS — a whiteboard, worksheet or textbook page, photographed.

   A phone photo is typically 3-12MB at 4000px or more on the long edge. That
   is far more than a model needs to read handwriting or print, it is slow to
   upload on a school connection, and base64 adds another third on top before
   it reaches the edge function. So a photo is checked and scaled down here,
   in the browser, before any of that happens.

   Only Gemini can read an image (see AI_PROVIDERS.md), so the caller should
   expect a clear "photo reading is unavailable" error rather than an answer
   from a text-only model when it is down — the edge function enforces that.
   ========================================================================= */

/** What a browser can decode for downscaling and Gemini accepts inline.
 *  HEIC is left out on purpose: only Safari decodes it, so on every other
 *  browser it would pass this check and then fail to scale. iPhones hand the
 *  web a JPEG from the camera input regardless. */
export const STUDY_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** The `accept=` value for photo pickers. Extensions as well as types, since
 *  some platforms filter the picker by one and not the other. */
export const STUDY_IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";

/** Largest photo accepted *before* scaling. Well above any phone camera's
 *  output, and low enough that decoding it cannot stall the tab. */
export const MAX_RAW_IMAGE_BYTES = 25 * 1024 * 1024;

/** Long-edge ceiling after scaling. Print and handwriting stay legible at
 *  this size, and it keeps a typical photo well under 1.5MB as JPEG. */
export const MAX_IMAGE_DIMENSION = 2048;

/** Photos already this small and within the dimension ceiling are sent as
 *  they are — re-encoding them would only lose quality. */
const SKIP_SCALE_BYTES = 1.5 * 1024 * 1024;

const JPEG_QUALITY = 0.85;

/** Thrown with copy that is safe to show the student as-is. */
export class StudyImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudyImageError";
  }
}

const EXTENSION_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** The image type of a file, read from its declared type or, when a browser
 *  leaves that empty, its extension. Null for anything that is not one. */
function imageTypeOf(file: File): string | null {
  if (file.type.startsWith("image/")) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TYPES[ext] ?? null;
}

/** True for any image — including ones `prepareStudyImage` will refuse, so
 *  a HEIC or GIF gets a clear "use a JPEG" error instead of being treated as
 *  a document. */
export function isImageFile(file: File): boolean {
  return imageTypeOf(file) !== null || /\.(heic|heif|gif|bmp|tiff?)$/i.test(file.name);
}

/** Scales `width` × `height` down so the long edge is at most `max`,
 *  keeping the aspect ratio. Never scales up. */
export function fitWithin(
  width: number,
  height: number,
  max: number = MAX_IMAGE_DIMENSION,
): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= max || longEdge === 0) return { width, height };
  const scale = max / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Rejects a file that cannot become a study photo, with the reason. */
export function validateStudyImage(file: File): void {
  const type = imageTypeOf(file);
  if (!type || !STUDY_IMAGE_TYPES.includes(type)) {
    throw new StudyImageError(
      "That image format can't be read. Use a JPEG, PNG or WebP photo.",
    );
  }
  if (file.size === 0) {
    throw new StudyImageError("That photo is empty. Try taking it again.");
  }
  if (file.size > MAX_RAW_IMAGE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    throw new StudyImageError(`That photo is ${mb}MB. The limit is 25MB.`);
  }
}

export interface PreparedImage {
  file: File;
  /** Size before scaling, so the UI can say what was done. */
  originalBytes: number;
  resized: boolean;
}

/** Validates a photo and scales it down to `MAX_IMAGE_DIMENSION` as a JPEG.
 *
 *  Returns the original untouched when it is already small, or when this
 *  browser cannot decode images off-screen (no `createImageBitmap`) and the
 *  original is still under `maxBytes`. Throws `StudyImageError` otherwise. */
export async function prepareStudyImage(
  file: File,
  maxBytes: number,
): Promise<PreparedImage> {
  validateStudyImage(file);
  const type = imageTypeOf(file) as string;
  const unchanged = (): PreparedImage => ({
    // A typeless file gets its type from the extension, so the edge
    // function is never sent an attachment with no mimeType.
    file: file.type ? file : new File([file], file.name, { type }),
    originalBytes: file.size,
    resized: false,
  });

  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    if (file.size <= maxBytes) return unchanged();
    throw new StudyImageError(
      "That photo is too large to send, and this browser can't shrink it. Try a smaller photo.",
    );
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new StudyImageError(
      "That photo couldn't be opened. It may be damaged — try taking it again.",
    );
  }

  try {
    const target = fitWithin(bitmap.width, bitmap.height);
    const needsScale =
      target.width !== bitmap.width || target.height !== bitmap.height;
    if (!needsScale && file.size <= Math.min(SKIP_SCALE_BYTES, maxBytes)) {
      return unchanged();
    }

    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      if (file.size <= maxBytes) return unchanged();
      throw new StudyImageError("That photo couldn't be resized. Try a smaller one.");
    }
    // JPEG has no transparency; a PNG screenshot would otherwise go black
    // wherever it was clear.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.drawImage(bitmap, 0, 0, target.width, target.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob || blob.size === 0) {
      if (file.size <= maxBytes) return unchanged();
      throw new StudyImageError("That photo couldn't be resized. Try a smaller one.");
    }
    if (blob.size > maxBytes) {
      throw new StudyImageError(
        "That photo is still too large after shrinking it. Try a smaller photo.",
      );
    }

    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return {
      file: new File([blob], `${baseName}.jpg`, { type: "image/jpeg" }),
      originalBytes: file.size,
      resized: true,
    };
  } finally {
    bitmap.close?.();
  }
}
