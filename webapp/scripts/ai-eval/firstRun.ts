/* The first-run lesson request, built exactly as FirstRunView sends it. */
import { generateFirstLesson } from "../../src/api/firstLesson";

export function firstRunLessonRequest(subject: string, level: string) {
  return generateFirstLesson(subject, level);
}
