import { NavLink } from "react-router";
import { Icon } from "../../components/Icon";
import styles from "./libraryWorkspaceNav.module.css";

export function LibraryWorkspaceNav() {
  return (
    <nav className={styles.nav} aria-label="Library workspace">
      <NavLink
        to="/library"
        className={({ isActive }) =>
          `${styles.link}${isActive ? ` ${styles.active}` : ""}`
        }
      >
        <Icon name="layers" size={16} />
        Library
        <span className={styles.hint}>files and revision sets</span>
      </NavLink>
      <NavLink
        to="/notebooks"
        className={({ isActive }) =>
          `${styles.link}${isActive ? ` ${styles.active}` : ""}`
        }
      >
        <Icon name="book-open" size={16} />
        Notebooks
        <span className={styles.hint}>connected sources</span>
      </NavLink>
    </nav>
  );
}
