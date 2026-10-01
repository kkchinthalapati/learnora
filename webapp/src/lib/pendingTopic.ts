/* A topic the student typed on first run but never got a lesson on (the AI
 * failed and they pressed "Skip to my plan"). The error card promised "your
 * topic is kept and you can start a lesson from Study any time"; this is
 * where it is kept, per account, until Study uses it. */
const key = (userId: string) => `learnora:pending_topic:${userId}`;

export function savePendingTopic(userId: string, topic: string): void {
  try {
    localStorage.setItem(key(userId), topic.slice(0, 200));
  } catch {
    /* Storage full or blocked: the promise degrades to the old behaviour. */
  }
}

export function readPendingTopic(userId: string | undefined): string | null {
  if (!userId) return null;
  try {
    return localStorage.getItem(key(userId));
  } catch {
    return null;
  }
}

export function clearPendingTopic(userId: string | undefined): void {
  if (!userId) return;
  try {
    localStorage.removeItem(key(userId));
  } catch {
    /* Nothing to do. */
  }
}
