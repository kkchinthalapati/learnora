import { createContext, useContext } from "react";

/* CreateModal context + hook. Provider lives in CreateModalProvider.tsx.
 *
 * Unlike the vanilla app — which has one rich Material-creation dialog, a
 * bare promptText() for folders, a separate exam modal, and no modal at all
 * for tasks — this is a deliberate new consolidation: one entry point with
 * four panels, so every "+" affordance in the app opens the same component
 * with a different starting panel instead of learning its own dialog. */

export type CreateEntityType = "material" | "subject" | "exam" | "task";

export interface OpenCreateModalOptions {
  /** Which panel is active on open. Defaults to "material". */
  type?: CreateEntityType;
  /** Pre-selected folder — only meaningful for the Material panel. */
  folderId?: string | null;
  /** Opens the Material panel already building from this saved material,
   *  rather than from a fresh upload. The notes sidebar's quick actions use
   *  it to mean "this document" (js/main.js:2589-2612). */
  materialId?: string;
  /** Pre-ticks the Material panel's outputs. Omitted keys keep their
   *  defaults (flashcards on, quiz off). */
  outputs?: { flashcards?: boolean; quiz?: boolean };
  /** Replaces the dialog's heading — for an entry point that opens it to do
   *  one specific thing ("Quiz on this document"). Applies only to the panel
   *  the dialog was opened on: switching panels restores that panel's own
   *  heading, which would otherwise be describing the wrong form. */
  title?: string;
  /** Called after a successful create, so the opener can refresh/navigate. */
  onDone?: () => void;
}

export interface CreateModalApi {
  openCreateModal: (options?: OpenCreateModalOptions) => void;
}

export const CreateModalContext = createContext<CreateModalApi | null>(null);

export function useCreateModal(): CreateModalApi {
  const ctx = useContext(CreateModalContext);
  if (!ctx) {
    throw new Error("useCreateModal must be used inside <CreateModalProvider>");
  }
  return ctx;
}
