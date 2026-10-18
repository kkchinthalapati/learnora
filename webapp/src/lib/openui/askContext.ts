import { createContext, useContext } from "react";

/* How a card asks the tutor something. Provided by the chat bubble; absent in
   surfaces that cannot send (the notes sidebar), where follow-up chips then
   simply are not drawn instead of being wired to nothing. */
export const AskContext = createContext<((text: string) => void) | null>(null);

export const useAsk = () => useContext(AskContext);
