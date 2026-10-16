import { ListRow, ListRows } from "../../components/ListRow";
import { parseLocalDate, WEEKDAY_NAMES } from "../../lib/date";
import { DEFAULT_BLOCK_MINUTES } from "../../lib/planShape";
import { formatMinutes, type DatedBlock } from "../../lib/subjects";

/* The study blocks planned for the rest of this week, as plain rows. The
 * week plan itself — generating, editing, rebalancing — stays on /plan; this
 * is where a subject shows its share of it (webapp/DESIGN.md 0.1). */

function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  const tomorrow = parseLocalDate(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const d = parseLocalDate(date);
  if (d.getTime() === tomorrow.getTime()) return "Tomorrow";
  return WEEKDAY_NAMES[d.getDay()];
}

export function WeekBlocks({
  blocks,
  today,
  showSubject,
  limit = 5,
}: {
  blocks: DatedBlock[];
  today: string;
  showSubject: boolean;
  limit?: number;
}) {
  return (
    <ListRows label="Planned this week">
      {blocks.slice(0, limit).map(({ date, block }, i) => {
        const when = [dayLabel(date, today), block.startHint].filter(Boolean).join(", ");
        const minutes = formatMinutes(block.durationMins ?? DEFAULT_BLOCK_MINUTES);
        return (
          <ListRow
            key={`${date}-${i}`}
            icon="calendar"
            title={showSubject ? `${block.subject} · ${minutes}` : `${when} · ${minutes}`}
            meta={showSubject ? when : (block.reason ?? "Planned study block")}
            chevron={false}
          />
        );
      })}
    </ListRows>
  );
}
