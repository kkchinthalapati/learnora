import { useLocation, useNavigate } from "react-router";
import { Icon } from "../../components/Icon";
import { useTimer } from "../../context/timer";
import {
  format,
  isActive,
  isCountUp,
  modeLabel,
  progressFraction,
} from "../../lib/timer";
import styles from "./MiniTimer.module.css";

/* Docked mini-timer — ports index.html:2278-2310 + `Timer._renderMini()`
 * (js/timer.js:582-605).
 *
 * Shown on every route while a session is live, except /timer itself (where
 * the full display already is). The vanilla read `window.location.hash` and
 * re-checked it on a `hashchange` listener; `useLocation` does that for free.
 *
 * Rendered by App.tsx rather than by any view, since it has to outlive route
 * changes — and it reads the same TimerProvider the full view does, so no
 * state is duplicated. */

export function MiniTimer() {
  const { state, toggle } = useTimer();
  const location = useLocation();
  const navigate = useNavigate();

  if (!isActive(state) || location.pathname === "/timer") return null;

  const seconds = isCountUp(state) ? state.elapsed : state.timeLeft;

  return (
    <div
      className={`${styles.mini}${state.isRunning ? ` ${styles.running}` : ""}`}
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        className={styles.main}
        aria-label="Open the timer"
        onClick={() => void navigate("/timer")}
      >
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.text}>
          <span className={styles.label}>{modeLabel(state)}</span>
          <span className={styles.time}>{format(seconds)}</span>
        </span>
      </button>
      <button
        type="button"
        className={styles.btn}
        aria-label={state.isRunning ? "Pause timer" : "Resume timer"}
        onClick={toggle}
      >
        <Icon name={state.isRunning ? "pause" : "play"} size={20} />
      </button>
      <span
        className={styles.bar}
        style={{ width: `${progressFraction(state) * 100}%` }}
        aria-hidden="true"
      />
    </div>
  );
}
