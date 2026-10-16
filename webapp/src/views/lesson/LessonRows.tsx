import { Button } from "../../components/Button";
import { ListRow, ListRows } from "../../components/ListRow";
import { ProgressRing } from "../../components/ProgressRing";
import { useRetryStudyPackage } from "../../hooks/useStudyPackage";
import type { Folder, Material } from "../../api/types";
import { formatRelativeTime } from "../../lib/date";
import {
  lessonIcon,
  lessonPath,
  lessonTitle,
  progressLabel,
  progressValue,
  type LessonProgress,
} from "../../lib/lessons";
import { deriveMaterialStatus, useAllMaterialProcessing } from "../../lib/materialProcessing";

/* A list of lessons, the same everywhere it appears — Home, Subjects and a
 * subject's own page (webapp/DESIGN.md 0.4). Each row says what subject it's
 * in (unless the page is already that subject), when it was added, and how
 * far along it is; a lesson whose notes are still being written or failed
 * says so, and a failed one can be retried from the row. */
export function LessonRows({
  lessons,
  progress,
  folders,
  showSubject = true,
  label = "Lessons",
}: {
  lessons: Material[];
  progress: Map<string, LessonProgress>;
  folders: Folder[];
  showSubject?: boolean;
  label?: string;
}) {
  const records = useAllMaterialProcessing();
  const retry = useRetryStudyPackage();
  const byId = new Map(folders.map((f) => [f.id, f]));

  return (
    <ListRows label={label}>
      {lessons.map((m) => {
        const folder = m.folder_id ? byId.get(m.folder_id) : undefined;
        const retrying =
          retry.isPending &&
          retry.variables !== undefined &&
          (typeof retry.variables === "string" ? retry.variables : retry.variables.materialId) === m.id;
        const status = retrying ? "processing" : deriveMaterialStatus(m, 1, records[m.id]).status;
        const p = progress.get(m.id);
        const parts = [
          showSubject ? (folder?.name ?? "No subject") : null,
          status === "processing"
            ? "Writing notes…"
            : status === "failed"
              ? "Notes didn't finish"
              : `added ${formatRelativeTime(m.created_at)}`,
        ].filter(Boolean);
        return (
          <ListRow
            key={m.id}
            icon={lessonIcon(m.type)}
            tint={folder?.color ?? null}
            title={lessonTitle(m)}
            meta={parts.join(" · ")}
            to={lessonPath(m.id)}
            trailing={
              status === "failed" ? (
                <Button size="sm" variant="secondary" onClick={() => retry.mutate(m.id)}>
                  Retry
                </Button>
              ) : (
                <ProgressRing
                  value={progressValue(p)}
                  label={progressLabel(p)}
                  center={p && p.total > 0 ? String(p.practised) : undefined}
                />
              )
            }
          />
        );
      })}
    </ListRows>
  );
}
