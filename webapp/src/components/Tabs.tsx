import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import styles from "./Tabs.module.css";

/* Parts of one page (DESIGN.md rule 0.4). The WAI-ARIA tabs pattern: one tab
 * stop for the strip, arrow keys move between tabs, Home/End jump to the
 * ends, and selection follows focus. The caller owns `value`, so a page can
 * keep the tab in the URL. Render the active panel with `TabPanel`, passing
 * the same `idBase` the strip returns through `useTabIds`. */

export interface TabItem<T extends string> {
  value: T;
  label: string;
  /** A small count after the label, e.g. cards due. */
  count?: number;
}

export function useTabIds() {
  return useId();
}

const tabId = (base: string, value: string) => `${base}-tab-${value}`;
const panelId = (base: string, value: string) => `${base}-panel-${value}`;

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  idBase,
}: {
  items: ReadonlyArray<TabItem<T>>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  idBase: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (index: number) => {
    const next = items[(index + items.length) % items.length];
    onChange(next.value);
    refs.current[(index + items.length) % items.length]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowRight") move(index + 1);
    else if (event.key === "ArrowLeft") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(items.length - 1);
    else return;
    event.preventDefault();
  };
  return (
    <div className={styles.strip} role="tablist" aria-label={label}>
      {items.map((item, index) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={tabId(idBase, item.value)}
            aria-selected={selected}
            aria-controls={panelId(idBase, item.value)}
            tabIndex={selected ? 0 : -1}
            className={`${styles.tab} ${selected ? styles.selected : ""}`}
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {item.label}
            {item.count ? <span className={styles.count}>{item.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  idBase,
  value,
  children,
}: {
  idBase: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={panelId(idBase, value)}
      aria-labelledby={tabId(idBase, value)}
      tabIndex={0}
      className={styles.panel}
    >
      {children}
    </div>
  );
}
