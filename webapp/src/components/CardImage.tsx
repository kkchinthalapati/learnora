import { useCardImageUrl } from "../hooks/useCardImage";

/* One card-side image, resolved from its storage key.
 *
 * Renders nothing at all while the signed URL is in flight or if it fails —
 * a broken-image icon in the middle of a review is worse than a card that
 * simply shows its text. */
export function CardImage({
  path,
  alt,
  className,
}: {
  path: string | null | undefined;
  alt: string;
  className?: string;
}) {
  const url = useCardImageUrl(path);
  if (!url) return null;
  return <img src={url} alt={alt} className={className} loading="lazy" />;
}
