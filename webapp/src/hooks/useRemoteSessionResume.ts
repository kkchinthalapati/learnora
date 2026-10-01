import { useEffect } from "react";
import { fetchLatestOpenSession } from "../api/studySessionSync";
import { adoptRemoteSession, loadStudySession } from "../lib/studySessions";

/* Today's Resume card reads this device's continuity snapshot. When this
 * device has nothing open, the newest unfinished session from any device is
 * brought in, so a session paused on a laptop can be picked up on a phone.
 * Once per mount, best-effort: a failed read just means no remote card. */
export function useRemoteSessionResume(hasLocalSession: boolean): void {
  useEffect(() => {
    if (hasLocalSession) return;
    let live = true;
    fetchLatestOpenSession()
      .then((remote) => {
        if (!live || !remote || loadStudySession(remote.id)) return;
        /* Only recent work: a week-old paused session is not "where you left
           off". */
        const age = Date.now() - new Date(remote.updatedAt).getTime();
        if (age > 7 * 86_400_000) return;
        adoptRemoteSession(remote);
      })
      .catch(() => {
        /* No card is the honest fallback. */
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
