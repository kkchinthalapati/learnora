import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import styles from "./ListRow.module.css";

/* One row in a list of lessons, subjects or decks (DESIGN.md rule 0.4).
 * A spine in the subject's colour, a leading icon, a serif title, one meta line, and a trailing slot for a
 * ProgressRing, chevron or menu. With `to` the whole row is one link; the
 * trailing slot sits outside it so a menu button inside never nests an
 * interactive element in an anchor. Render inside a <ul>. */

interface ListRowProps {
  title: string;
  meta?: ReactNode;
  icon?: IconName;
  /** Colours the row's spine and icon, e.g. a subject's colour. Any CSS colour. */
  tint?: string | null;
  to?: string;
  onClick?: () => void;
  trailing?: ReactNode;
  /** Draws a chevron when there is no trailing content and the row links. */
  chevron?: boolean;
}

export function ListRow({
  title,
  meta,
  icon = "book-open",
  tint,
  to,
  onClick,
  trailing,
  chevron = true,
}: ListRowProps) {
  const body = (
    <>
      <span className={styles.tile} aria-hidden="true">
        <Icon name={icon} size={20} />
      </span>
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </span>
    </>
  );
  const end =
    trailing ??
    (chevron && (to || onClick) ? (
      <Icon name="chevron-down" size={16} className={styles.chevron} />
    ) : null);
  return (
    <li
      className={styles.row}
      style={tint ? ({ "--row-tint": tint } as CSSProperties) : undefined}
    >
      {to ? (
        <Link to={to} className={styles.main} onClick={onClick}>
          {body}
        </Link>
      ) : onClick ? (
        <button type="button" className={styles.main} onClick={onClick}>
          {body}
        </button>
      ) : (
        <div className={styles.main}>{body}</div>
      )}
      {end ? <span className={styles.trailing}>{end}</span> : null}
    </li>
  );
}

/** The <ul> a set of ListRows sits in. */
export function ListRows({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul className={styles.list} aria-label={label}>
      {children}
    </ul>
  );
}
