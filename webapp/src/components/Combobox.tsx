import { useRef, useState, useEffect, useCallback, useId } from "react";
import styles from "./combobox.module.css";
import { useFocusTrap } from "../hooks/useFocusTrap";

export interface ComboboxOption {
  label: string;
  value: string;
}

export interface ComboboxProps {
  id?: string;
  options: ComboboxOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
}

/**
 * A searchable dropdown combobox with keyboard navigation.
 *
 * Features:
 * - Type to filter options (case-insensitive substring match)
 * - Arrow keys to navigate
 * - Enter to select
 * - Escape to close
 * - Click outside to close
 * - Focus trap when open
 */
export function Combobox({
  id,
  options,
  value,
  onChange,
  placeholder = "Search...",
  label,
  disabled = false,
}: ComboboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listboxId = `${inputId}-listbox`;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useFocusTrap(containerRef, open);

  /* Filter options based on search term */
  const filtered = options.filter((opt) =>
    opt.label.toLowerCase().includes(search.toLowerCase()),
  );

  const selectedOption = options.find((opt) => opt.value === value);

  /* Close on click outside */
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  /* Handle keyboard navigation */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen(true);
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          if (filtered.length === 0) return;
          e.preventDefault();
          setHighlightIndex((i) => (i + 1) % filtered.length);
          break;
        case "ArrowUp":
          if (filtered.length === 0) return;
          e.preventDefault();
          setHighlightIndex((i) => (i - 1 + filtered.length) % filtered.length);
          break;
        case "Enter":
          e.preventDefault();
          if (filtered[highlightIndex]) {
            onChange(filtered[highlightIndex].value);
            setOpen(false);
            setSearch("");
          }
          break;
        case "Escape":
          e.preventDefault();
          setOpen(false);
          setSearch("");
          break;
      }
    },
    [open, filtered, highlightIndex, onChange],
  );

  const handleSelectOption = (value: string) => {
    onChange(value);
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={containerRef} className={styles.container}>
      {label && <label className={styles.label} htmlFor={inputId}>{label}</label>}
      <div className={styles.inputWrapper}>
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          className={styles.input}
          placeholder={placeholder}
          value={open ? search : selectedOption?.label || ""}
          onChange={(e) => {
            setSearch(e.target.value);
            setHighlightIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
        />
        <div className={`${styles.chevron} ${open ? styles.open : ""}`}>
          ▼
        </div>
      </div>

      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          id={listboxId}
          className={styles.list}
          role="listbox"
        >
          {filtered.map((opt, idx) => (
            <li
              key={opt.value}
              className={`${styles.option} ${
                idx === highlightIndex ? styles.highlighted : ""
              }`}
              role="option"
              aria-selected={idx === highlightIndex}
              onClick={() => handleSelectOption(opt.value)}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}

      {open && filtered.length === 0 && (
        <div className={styles.empty}>No results</div>
      )}
    </div>
  );
}
