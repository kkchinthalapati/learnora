/* Count + correctly-inflected noun.
 *
 * The app had two pluralisation implementations sitting 200px apart on the
 * same Notebooks card: the source count in the card header was inflected
 * correctly, while the footer rendered "1 grounded sources" and the dashboard
 * shelf rendered "1 sources". Regular English plurals only — anything
 * irregular passes its own plural form explicitly. */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
