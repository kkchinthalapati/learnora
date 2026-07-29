/* Port of the avatar-initials derivation in js/router.js:228-233.
 *
 * Lives apart from AccountTab so the component file exports only a
 * component (Fast Refresh) and so the "" / one-word / many-word cases are
 * testable without rendering the tab. The vanilla's `name.split(" ")
 * .map(w => w[0])` threw on a name with a double space — `w` is "" and
 * `w[0]` is undefined, which `.join("")` silently turned into "" but
 * `.toUpperCase()` on the result still worked; the empty segments are
 * filtered out here instead. */

export function initialsFor(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}
