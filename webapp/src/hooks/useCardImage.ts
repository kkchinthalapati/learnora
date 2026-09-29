import { useEffect, useState } from "react";
import { flashcardsApi } from "../api/flashcards";
import { useOptionalAuth } from "../context/auth";
import { loadOfflineImage } from "../lib/offlineCards";

/* Resolves a card image's storage key to a signed URL.
 *
 * The bucket is private, so every render of an image needs a fresh signed
 * URL rather than a stable public one. Kept as a hook (not a query) because
 * the URL is short-lived and tied to one mounted image; the guard against a
 * late resolution writing into an unmounted component is the reason this
 * isn't just an inline effect at each call site. */
export function useCardImageUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const userId = useOptionalAuth()?.user?.id ?? null;

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let active = true;
    let objectUrl: string | null = null;

    /* Offline (or the signed URL can't be had): the device's saved copy of
       this image, if the offline sync kept one (lib/offlineCards.ts). Still
       nothing at all rather than a broken image when it didn't. */
    const fromDevice = async () => {
      const blob = userId ? await loadOfflineImage(userId, path) : null;
      if (!active) return;
      if (blob) {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } else {
        setUrl(null);
      }
    };

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      void fromDevice();
    } else {
      flashcardsApi
        .getImageUrl(path)
        .then((signed) => {
          if (active) setUrl(signed);
        })
        .catch(() => void fromDevice());
    }
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, userId]);

  return url;
}
