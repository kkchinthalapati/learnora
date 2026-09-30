import type { UseStudySession } from "../../hooks/useStudySession";
import type { StudySessionRecord } from "../../lib/studySessions";
import type { SessionMode } from "../../lib/sessionModes";

export interface ModeProps {
  session: StudySessionRecord;
  ctl: UseStudySession;
  /** Open "Flag this answer" for a piece of tutor text. */
  onFlag: (answer: string) => void;
  onSwitchMode: (mode: SessionMode) => void;
}
