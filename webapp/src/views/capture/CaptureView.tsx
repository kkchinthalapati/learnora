import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { CaptureBar } from "../../components/capture/CaptureBar";
import { takeSharedCapture, type SharedCapture } from "../../lib/sharedCapture";
import styles from "./capture.module.css";

/* /capture — the capture bar on its own page. It is where "Share to
 * Learnora" lands (?shared=1, filled from the service worker's cache), and
 * accepts ?text= for a link from elsewhere that wants to hand something over. */
export function CaptureView() {
  const [params] = useSearchParams();
  const fromShare = params.get("shared") === "1";
  const [shared, setShared] = useState<SharedCapture | null>(
    fromShare ? null : { text: params.get("text") ?? "", file: null },
  );

  useEffect(() => {
    if (!fromShare) return;
    let cancelled = false;
    takeSharedCapture()
      .catch(() => null)
      .then((taken) => {
        if (!cancelled) setShared(taken ?? { text: "", file: null });
      });
    return () => {
      cancelled = true;
    };
  }, [fromShare]);

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>What do you want to learn?</h1>
      <p className={styles.lede}>
        Bring what you're studying. Learnora makes notes and cards from it, then remembers what you get wrong.
      </p>
      {shared ? (
        <CaptureBar
          initialText={shared.text}
          initialFile={shared.file}
          autoFocus={!shared.file}
        />
      ) : (
        <p className={styles.lede} role="status">
          Opening what you shared…
        </p>
      )}
    </div>
  );
}
