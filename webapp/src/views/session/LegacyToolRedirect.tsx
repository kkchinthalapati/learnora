import { Navigate, useParams, useSearchParams } from "react-router";
import { newSessionHref, sessionHref, type SessionMode } from "../../lib/sessionModes";

/* The study tools became modes of one Session (2026-09 redesign). Their old
 * URLs — bookmarks, links in notes, emails — redirect here and keep the topic
 * they carried:
 *   /solver, /debugger          → Explain
 *   /feynman                    → Teach
 *   /feynman/studio/:id         → that session, in Teach
 *   /viva, /sparring (+ /:id)   → Socratic with the mic on
 *   /exam-detective             → Practice, exam-traps preset
 * Sparring sessions only ever lived in memory, so a /viva/:id link has no
 * session to reopen and starts a fresh one on the same terms. */
export function LegacyToolRedirect({
  mode,
  voice = false,
  preset,
  keepSessionId = false,
}: {
  mode: SessionMode;
  voice?: boolean;
  preset?: "traps";
  keepSessionId?: boolean;
}) {
  const { sessionId } = useParams<{ sessionId?: string }>();
  const [params] = useSearchParams();

  if (keepSessionId && sessionId) {
    return <Navigate to={sessionHref(sessionId, mode)} replace />;
  }

  const topic = params.get("topic") ?? undefined;
  return (
    <Navigate to={newSessionHref(mode, { topic, voice, preset })} replace />
  );
}
