import { createRoot, type Root } from "react-dom/client";
import OpenUiBlock from "../../components/chat/OpenUiBlock";
import { guideLibrary } from "./library";

/* Draws an OpenUI card into a node the notes editor owns (the `openui` embed
 * in lib/noteFormats.ts). Quill builds and throws away those nodes itself, so
 * each one gets its own React root, kept here and unmounted when the embed is
 * removed from the document.
 *
 * Notes use the guide library: no quizzes, flashcards or follow-up chips,
 * which belong to their own tools rather than to a page of notes. */

const roots = new WeakMap<HTMLElement, Root>();

export function mountCard(node: HTMLElement, code: string): void {
  let root = roots.get(node);
  if (!root) {
    root = createRoot(node);
    roots.set(node, root);
  }
  root.render(<OpenUiBlock code={code} library={guideLibrary} />);
}

export function unmountCard(node: HTMLElement): void {
  const root = roots.get(node);
  if (!root) return;
  roots.delete(node);
  /* Deferred: Quill can remove an embed while React is mid-render (a delete
     inside a change handler), and unmounting synchronously there warns. */
  setTimeout(() => root.unmount(), 0);
}
