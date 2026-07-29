import { createContext, useContext } from "react";

/* Toast context + hook. Provider lives in ToastProvider.tsx. */

export interface ToastOptions {
  error?: boolean;
  duration?: number;
  actionLabel?: string;
  onAction?: () => void;
}

export interface Toast extends ToastOptions {
  id: number;
  message: string;
}

export interface ToastApi {
  showToast: (message: string, options?: ToastOptions) => number;
  dismissToast: (id: number) => void;
  notifyFetchError: (context: string) => void;
}

export const TOAST_DEFAULT_DURATION = 6000;

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
