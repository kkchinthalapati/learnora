import { createContext, useContext } from "react";

/* Whether a worked example hides its working until the student asks for it,
   one step at a time. Provided by Learn, where the student should try the
   next step before seeing it; everywhere else (chat, notes) the working is
   reference and is shown whole. */
export const RevealSteps = createContext(false);

export const useRevealSteps = () => useContext(RevealSteps);
