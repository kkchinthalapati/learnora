import { useEffect, useState } from "react";
import { flashcardsApi } from "../api/flashcards";

/* Resolves a card image's storage key to a signed URL.
 *
 * The bucket is private, so every render of an image needs a fresh signed
 * URL rather than a stable public one. Kept as a hook (not a query) because
 * the URL is short-lived and tied to one mounted image; the guard against a
 * late resolution writing into an unmounted component is the reason this
 * isn't just an inline effect at each call site. */
export function useCardImageUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let active = true;
    flashcardsApi
      .getImageUrl(path)
      .then((signed) => {
        if (active) setUrl(signed);
      })
      .catch(() => {
        if (active) setUrl(null);
      });
    return () => {
      active = false;
    };
  }, [path]);

  return url;
}
