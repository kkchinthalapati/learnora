import { useAppearance } from "../../../context/appearance";
import { MoonIcon, SunIcon } from "./icons";
import styles from "../slackWorkspace.module.css";

export interface WorkspaceRailProps {
  userName: string;
  userRole?: string;
  onDmClick?: () => void;
}

export function WorkspaceRail({ userName, userRole = "founder", onDmClick }: WorkspaceRailProps) {
  const { appearance, setAppearance } = useAppearance();

  const isDark =
    appearance.mode === "dark" ||
    (appearance.mode === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches);

  const handleToggleTheme = () => {
    setAppearance({ mode: isDark ? "light" : "dark" });
  };

  return (
    <nav className={styles.rail} aria-label="Workspaces">
      {/* Active Workspace: Learnora Founders */}
      <div className={styles.railItemActive} title="Learnora Founders">
        <div className={styles.activePill} />
        <div className={styles.workspacePill} aria-label="Learnora Founders workspace">
          LF
        </div>
      </div>

      <div className={styles.railDivider} />

      {/* Direct Messages Shortcut */}
      <button
        type="button"
        className={styles.railIconButton}
        onClick={onDmClick}
        title="Direct Messages"
        aria-label="Direct Messages"
      >
        💬
      </button>

      <div className={styles.railSpacer} />

      {/* Theme Toggle Button */}
      <button
        type="button"
        className={styles.railThemeToggle}
        onClick={handleToggleTheme}
        title={isDark ? "Switch to light theme" : "Switch to dark theme"}
        aria-label="Toggle theme"
      >
        {isDark ? <SunIcon /> : <MoonIcon />}
      </button>

      {/* User Avatar */}
      <div
        className={styles.railUserAvatar}
        title={`${userName} (${userRole})`}
        aria-label={`${userName} avatar`}
      >
        {userName ? userName[0].toUpperCase() : "U"}
      </div>
    </nav>
  );
}
