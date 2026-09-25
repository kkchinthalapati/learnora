/* Subject names come from whatever the student typed — folders and exams
   alike — so one list can hold "Biology" next to "maths". Capitalise the
   first letter for display only; the stored name stays as typed, so matching
   against folders and exams is unchanged. */
export function displaySubjectName(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
