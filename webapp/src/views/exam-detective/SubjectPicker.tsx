import { useEffect, useId, useMemo, useRef } from "react";
import { useExams } from "../../hooks/useExams";
import { useFolders } from "../../hooks/useFolders";
import { CognitiveBridge } from "../../lib/cognitiveBridge";
import styles from "./examDetective.module.css";

/* Which subject the trap tooling is working on.
 *
 * This replaces a hardcoded <select> of five generic strings ("Calculus &
 * STEM", "Economics & History") that had no relationship to anything the
 * student had told the app. Exam Detective is one of the four diagnostic tools
 * the product thesis rests on, and it was opening with a form that knew
 * nothing — the exact failure FEATURE_AUDIT.md calls "a chatbot with a logo".
 *
 * Three sources, in priority order:
 *   1. a CognitiveBridge payload, when another screen sent the student here
 *      about a specific subject (the subject page's trap button writes one);
 *   2. the student's own exams and subject folders;
 *   3. free text, for a subject they have not filed yet.
 */

export const CUSTOM_SUBJECT = "__custom__";

interface SubjectPickerProps {
  /** The resolved subject string the tools should use. */
  value: string;
  onChange: (subject: string) => void;
  /** Which option is selected — an exam/folder name, or CUSTOM_SUBJECT. */
  selection: string;
  onSelectionChange: (selection: string) => void;
  label?: string;
  /** Called once if a bridged payload named a subject on arrival. */
  onBridgedSubject?: (subject: string) => void;
}

export function SubjectPicker({
  value,
  onChange,
  selection,
  onSelectionChange,
  label = "Subject",
  onBridgedSubject,
}: SubjectPickerProps) {
  const selectId = useId();
  const customId = useId();
  const exams = useExams();
  const folders = useFolders();

  /* Only seed empty parent state. The picker remounts when switching tool tabs,
     so the local ref alone cannot distinguish arrival from a later tab mount. */
  const consumedBridge = useRef(false);
  useEffect(() => {
    if (consumedBridge.current || value) return;
    const bridged = CognitiveBridge.getPayload();
    const target = bridged?.subject || bridged?.concept || bridged?.topic;
    if (!target) return;
    consumedBridge.current = true;
    onSelectionChange(CUSTOM_SUBJECT);
    onChange(target);
    onBridgedSubject?.(target);
  }, [value, onChange, onSelectionChange, onBridgedSubject]);

  /* An exam and a folder can carry the same name — revising for "Biology"
     with a "Biology" subject folder is the normal case, not an edge one — and
     two <option>s with the same value make the select unusable. */
  const options = useMemo(() => {
    const examNames = (exams.data ?? []).map((e) => e.exam_name).filter(Boolean);
    const folderNames = (folders.data ?? [])
      .map((f) => f.name)
      .filter((name) => name && !examNames.includes(name));
    return { examNames, folderNames };
  }, [exams.data, folders.data]);

  const hasSaved =
    options.examNames.length > 0 || options.folderNames.length > 0;

  /* With no bridged subject, open on the student's nearest exam — or failing
     that their first subject folder — rather than on an empty box. Guarded by
     the same ref so it cannot overwrite a bridged subject or a choice the
     student has already made. */
  useEffect(() => {
    if (consumedBridge.current || value || !hasSaved) return;
    consumedBridge.current = true;
    const first = options.examNames[0] ?? options.folderNames[0];
    onSelectionChange(first);
    onChange(first);
  }, [hasSaved, options, value, onChange, onSelectionChange]);

  return (
    <>
      <div className={styles.formRow}>
        <label htmlFor={selectId} className={styles.pickerLabel}>
          {label}
        </label>
        <select
          id={selectId}
          className={styles.selectInput}
          value={selection}
          onChange={(e) => {
            const next = e.target.value;
            onSelectionChange(next);
            if (next !== CUSTOM_SUBJECT) onChange(next);
          }}
        >
          {options.examNames.length > 0 ? (
            <optgroup label="Your exams">
              {options.examNames.map((name) => (
                <option key={`exam-${name}`} value={name}>
                  {name}
                </option>
              ))}
            </optgroup>
          ) : null}
          {options.folderNames.length > 0 ? (
            <optgroup label="Your subjects">
              {options.folderNames.map((name) => (
                <option key={`folder-${name}`} value={name}>
                  {name}
                </option>
              ))}
            </optgroup>
          ) : null}
          <option value={CUSTOM_SUBJECT}>
            {hasSaved ? "Something else…" : "Type a subject…"}
          </option>
        </select>
      </div>

      {selection === CUSTOM_SUBJECT ? (
        <div className={styles.formRow}>
          <label htmlFor={customId} className={styles.pickerLabel}>
            Which subject?
          </label>
          <input
            id={customId}
            type="text"
            className={styles.textInput}
            value={value}
            placeholder="e.g. Organic chemistry"
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      ) : null}
    </>
  );
}
