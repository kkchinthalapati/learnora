import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
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
  const stripRef = useRef<HTMLDivElement>(null);
  /* On a phone the lesson's six tabs overflow and Tutor and Mistakes sat
     off-screen with nothing to say so (audit 2026-11-07 §5). A fade marks
     the edge that has more. */
  const [more, setMore] = useState("");
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const update = () => {
      const left = strip.scrollLeft > 1;
      const right = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1;
      setMore([left ? "left" : "", right ? "right" : ""].filter(Boolean).join(" "));
    };
    update();
    strip.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(strip);
    return () => {
      strip.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [items.length]);
  /* A page opened on a later tab (?tab=mistakes) shows it. */
  const selectedIndex = items.findIndex((item) => item.value === value);
  useEffect(() => {
    /* Only the strip scrolls, sideways; scrollIntoView could move the page. */
    const el = refs.current[selectedIndex];
    const strip = stripRef.current;
    if (!el || !strip) return;
    const tab = el.getBoundingClientRect();
    const box = strip.getBoundingClientRect();
    if (tab.right > box.right) strip.scrollLeft += tab.right - box.right;
    else if (tab.left < box.left) strip.scrollLeft -= box.left - tab.left;
  }, [selectedIndex]);
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
    <div
      ref={stripRef}
      className={styles.strip}
      role="tablist"
      aria-label={label}
      data-more={more || undefined}
    >
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
