/* "Share to Learnora": the installed app is a share target (see the
 * manifest's share_target). The service worker (public/sw.js, receiveShare)
 * catches the POST, keeps the shared item in the "learnora-share" cache and
 * sends the page to /capture?shared=1. This reads it back exactly once. */

export const SHARE_CACHE = "learnora-share";
const META_KEY = "/app/capture/__meta";
const FILE_KEY = "/app/capture/__file";

export interface SharedCapture {
  text: string;
  file: File | null;
}

interface SharedMeta {
  title?: string;
  text?: string;
  url?: string;
  fileName?: string | null;
  fileType?: string | null;
}

/** Apps share a link in `url`, in `text`, or as "Title https://…" in
 *  `text`; a bare link wins so the capture bar reads it as one. */
export function sharedText(meta: SharedMeta): string {
  const url = meta.url?.trim();
  if (url) return url;
  const text = meta.text?.trim() ?? "";
  const linkInText = text.match(/https?:\/\/\S+/);
  if (linkInText && text.replace(linkInText[0], "").trim().length < 120) {
    return linkInText[0];
  }
  return text || meta.title?.trim() || "";
}

export async function takeSharedCapture(): Promise<SharedCapture | null> {
  if (typeof caches === "undefined") return null;
  const cache = await caches.open(SHARE_CACHE);
  const metaResponse = await cache.match(META_KEY);
  if (!metaResponse) return null;
  const meta = (await metaResponse.json()) as SharedMeta;
  const fileResponse = await cache.match(FILE_KEY);
  const file =
    fileResponse && meta.fileName
      ? new File([await fileResponse.blob()], meta.fileName, {
          type: meta.fileType ?? "",
        })
      : null;
  await Promise.all([cache.delete(META_KEY), cache.delete(FILE_KEY)]);
  return { text: file ? "" : sharedText(meta), file };
}
