import { createContext, useContext } from "react";

/* Dialog context + hook. Provider lives in DialogProvider.tsx. */

export interface DialogOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  placeholder?: string;
  defaultValue?: string;
  /** Input type for `promptText`. "password" masks the value and keeps
   *  password managers from filing it as a username — needed by the
   *  re-authentication prompt on account deletion. */
  inputType?: "text" | "password";
}

export interface DialogRequest extends DialogOptions {
  message: string;
  isPrompt: boolean;
  resolve: (value: boolean | string | null) => void;
}

export interface DialogApi {
  confirm: (message: string, options?: DialogOptions) => Promise<boolean>;
  promptText: (
    message: string,
    options?: DialogOptions,
  ) => Promise<string | null>;
}

export const DialogContext = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used inside <DialogProvider>");
  return ctx;
}
