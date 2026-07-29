import { useCallback, useMemo, useState, type ReactNode } from "react";
import { CreateModalContext, type OpenCreateModalOptions } from "./createModal";
import { CreateModal } from "../components/create/CreateModal";

export function CreateModalProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<OpenCreateModalOptions | null>(null);
  // Bumped on every open and used as CreateModal's `key` so each open mounts
  // a fresh component tree — the same "never inherit the last run's state"
  // guarantee vanilla's showCreateModal() got by resetting every field by
  // hand, but for free.
  const [sessionId, setSessionId] = useState(0);

  const openCreateModal = useCallback((opts: OpenCreateModalOptions = {}) => {
    setOptions(opts);
    setSessionId((id) => id + 1);
  }, []);

  const close = useCallback(() => setOptions(null), []);

  const value = useMemo(() => ({ openCreateModal }), [openCreateModal]);

  return (
    <CreateModalContext.Provider value={value}>
      {children}
      <CreateModal key={sessionId} options={options} onClose={close} />
    </CreateModalContext.Provider>
  );
}
