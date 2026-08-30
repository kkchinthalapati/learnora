import type { ReactNode } from "react";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import styles from "./EmptyState.module.css";

interface EmptyStateProps {
  title?: string;
  message: string;
  icon?: IconName;
  size?: "md" | "sm";
  /* Fill the parent's height and centre within it, for an empty state that
     stands in for a canvas or pane rather than sitting in document flow. */
  fill?: boolean;
  children?: ReactNode;
}

export function EmptyState({
  title,
  message,
  icon,
  size = "md",
  fill,
  children,
}: EmptyStateProps) {
  if (size === "sm") {
    return <p className={`${styles.emptyState} ${styles.sm}`}>{message}</p>;
  }
  const classes = [styles.emptyState, fill ? styles.fill : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes}>
      {icon ? <Icon name={icon} size={32} className={styles.icon} /> : null}
      {title ? <p className={styles.title}>{title}</p> : null}
      <p>{message}</p>
      {children ? <div className={styles.actions}>{children}</div> : null}
    </div>
  );
}
