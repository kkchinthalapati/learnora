import { Link } from "react-router";
import styles from "./dashboard.module.css";

interface DashboardCardHeaderProps {
  eyebrow: string;
  action?: {
    to: string;
    label: string;
  };
}

export function DashboardCardHeader({
  eyebrow,
  action,
}: DashboardCardHeaderProps) {
  return (
    <div className={styles.cardHead}>
      <span className={styles.eyebrow}>{eyebrow}</span>
      {action ? (
        <Link to={action.to} className={styles.link}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
