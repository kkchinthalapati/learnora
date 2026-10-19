import { isFlagOn } from "../flags";

/** The OPENUI CARDS prompt section, or "" when the `openUi` flag is off.
 *  Loaded on demand so the card library and its schemas stay out of the main
 *  bundle for anyone who has switched cards off. */
export async function loadOpenUiSection(): Promise<string> {
  if (!isFlagOn("openUi")) return "";
  return (await import("./blocks")).openUiPromptSection();
}
