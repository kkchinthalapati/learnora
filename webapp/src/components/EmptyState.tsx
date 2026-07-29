import type { ReactNode } from "react";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import styles from "./EmptyState.module.css";

interface EmptyStateProps {
  title?: string;
  message: string;
  icon?: IconName;
  size?: "md" | "sm";
  children?: ReactNode;
}

export function EmptyState({
  title,
  message,
  icon,
  size = "md",
  children,
}: EmptyStateProps) {
  if (size === "sm") {
    return <p className={`${styles.emptyState} ${styles.sm}`}>{message}</p>;
  }
  return (
    <div className={styles.emptyState}>
      {icon ? <Icon name={icon} size={32} className={styles.icon} /> : null}
      {title ? <p className={styles.title}>{title}</p> : null}
      <p>{message}</p>
      {children ? <div className={styles.actions}>{children}</div> : null}
    </div>
  );
}
