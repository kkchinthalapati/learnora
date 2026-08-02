import { useState } from "react";
import { Icon } from "../../components/Icon";
import { useChat } from "../../context/chat";
import styles from "./commandBar.module.css";

/* The dashboard's floating AI command bar — ports index.html:2459-2475 and
 * its wiring in js/ui.js.
 *
 * Submitting opens the chat panel and sends into the same conversation, which
 * is what the vanilla did: one `#turbo-chat`, several ways in. */
export function CommandBar() {
  const { open, send } = useChat();
  const [value, setValue] = useState("");

  return (
    <form
      className={styles.bar}
      onSubmit={(e) => {
        e.preventDefault();
        const query = value.trim();
        if (!query) return;
        setValue("");
        open();
        void send(query);
      }}
    >
      <span className={styles.icon} aria-hidden="true">
        <Icon name="bot" size={18} />
      </span>
      <input
        type="text"
        className={styles.input}
        value={value}
        placeholder="Ask AI to do anything... (e.g. 'Start a 25m timer')"
        autoComplete="off"
        aria-label="Ask Learnora AI"
        onChange={(e) => setValue(e.target.value)}
      />
      <button
        type="submit"
        className={styles.send}
        aria-label="Send AI command"
      >
        <Icon name="send" size={16} />
      </button>
    </form>
  );
}
