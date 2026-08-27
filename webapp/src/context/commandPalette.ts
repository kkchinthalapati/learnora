import { createContext, useContext } from "react";

export interface CommandPaletteApi {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  openWithPrefix: (prefix: string) => void;
  initialQuery: string;
}

export const CommandPaletteContext = createContext<CommandPaletteApi | null>(null);

export function useCommandPalette(): CommandPaletteApi {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    throw new Error("useCommandPalette must be used inside <CommandPaletteProvider>");
  }
  return ctx;
}

export function useOptionalCommandPalette(): CommandPaletteApi | null {
  return useContext(CommandPaletteContext);
}
