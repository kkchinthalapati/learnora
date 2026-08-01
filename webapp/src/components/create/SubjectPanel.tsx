import { useRef, useState, type FormEvent } from "react";
import { useAddFolder } from "../../hooks/useFolders";
import { useToast } from "../../context/toast";
import { Button } from "../Button";
import shared from "./formShared.module.css";
import styles from "./SubjectPanel.module.css";

interface SubjectPanelProps {
  onClose: () => void;
  onDone?: () => void;
}

/* Vanilla has no dedicated Subject/Folder dialog — folders are created ad hoc
 * via a bare UI.promptText() from inside the Material dialog's "+ New"
 * button (js/main.js:195-212), picking a random color from this same
 * palette. This panel is a real first-class surface for the same action. */
const COLOR_PALETTE = ["#4A90E2", "#E24A4A", "#4AE283", "#E2A84A", "#9B4AE2"];

export function SubjectPanel({ onClose, onDone }: SubjectPanelProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLOR_PALETTE[0]);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const addFolder = useAddFolder();
  const { showToast } = useToast();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the subject a name.");
      nameRef.current?.focus();
      return;
    }
    setError(null);
    try {
      await addFolder.mutateAsync({ name: trimmed, color });
      showToast(`Created "${trimmed}".`);
      onDone?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className={shared.inputGroup}>
        <label htmlFor="subject-name">Name</label>
        <input
          ref={nameRef}
          id="subject-name"
          className={shared.field}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. CS101, Biology"
          maxLength={80}
          autoFocus
        />
      </div>

      <div className={shared.inputGroup}>
        <label id="subject-color-label">Color</label>
        <div
          className={styles.swatches}
          role="radiogroup"
          aria-labelledby="subject-color-label"
        >
          {COLOR_PALETTE.map((c) => (
            <label
              key={c}
              className={styles.swatch}
              style={{ backgroundColor: c }}
            >
              <input
                type="radio"
                name="subject-color"
                value={c}
                checked={color === c}
                onChange={() => setColor(c)}
                aria-label={c}
              />
            </label>
          ))}
        </div>
      </div>

      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={shared.actions}>
        <Button type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={addFolder.isPending}>
          {addFolder.isPending ? "Creating…" : "Create subject"}
        </Button>
      </div>
    </form>
  );
}
