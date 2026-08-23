import { useEffect, useRef, useState } from "react";
import type { HeatmapData, HeatmapCell } from "../../lib/analyticsEngine";
import styles from "./analytics.module.css";

interface StudyHeatmapProps {
  data: HeatmapData;
  className?: string;
}

interface TooltipState {
  cell: HeatmapCell;
  x: number;
  y: number;
}

export function StudyHeatmap({ data, className }: StudyHeatmapProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const cellRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const latestActiveIndex = data.cells.reduce(
      (latest, cell, index) => (cell.minutes > 0 ? index : latest),
      -1,
    );
    setFocusIndex(
      latestActiveIndex >= 0
        ? latestActiveIndex
        : Math.max(0, data.cells.length - 1),
    );
  }, [data.cells]);

  // Group cells into 7-day columns (weeks)
  const weeks: HeatmapCell[][] = [];
  for (let i = 0; i < data.cells.length; i += 7) {
    weeks.push(data.cells.slice(i, i + 7));
  }

  const handleCellHover = (
    cell: HeatmapCell,
    e:
      React.MouseEvent<HTMLButtonElement> | React.FocusEvent<HTMLButtonElement>,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      cell,
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  };

  const handleCellLeave = () => {
    setTooltip(null);
  };

  const handleCellKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    let nextIndex: number | null = null;
    if (e.key === "ArrowUp") nextIndex = index - 1;
    if (e.key === "ArrowDown") nextIndex = index + 1;
    if (e.key === "ArrowLeft") nextIndex = index - 7;
    if (e.key === "ArrowRight") nextIndex = index + 7;
    if (e.key === "Home") nextIndex = index - (index % 7);
    if (e.key === "End") nextIndex = index - (index % 7) + 6;
    if (nextIndex === null) return;

    e.preventDefault();
    const boundedIndex = Math.min(
      Math.max(nextIndex, 0),
      data.cells.length - 1,
    );
    setFocusIndex(boundedIndex);
    cellRefs.current[boundedIndex]?.focus();
  };

  const formatTooltipDate = (d: Date) => {
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatMinutes = (mins: number) => {
    if (mins <= 0) return "No focus time logged";
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    if (hours === 0) return `${mins} min${mins === 1 ? "" : "s"}`;
    if (remainingMins === 0) return `${hours} hr${hours === 1 ? "" : "s"}`;
    return `${hours}h ${remainingMins}m`;
  };

  const getLevelClass = (level: 0 | 1 | 2 | 3 | 4) => {
    switch (level) {
      case 1:
        return styles.cellLvl1;
      case 2:
        return styles.cellLvl2;
      case 3:
        return styles.cellLvl3;
      case 4:
        return styles.cellLvl4;
      default:
        return styles.cellLvl0;
    }
  };

  return (
    <div
      className={[styles.heatmapContainer, className].filter(Boolean).join(" ")}
    >
      <div className={styles.heatmapWrapper}>
        <div className={styles.heatmapRoot}>
          {/* Month labels row */}
          <div className={styles.monthLabelsRow} aria-hidden="true">
            {data.monthLabels.map((lbl, i) => {
              // 12px cell + 3px gap = 15px per column
              const leftOffset = lbl.index * 15;
              return (
                <span
                  key={`${lbl.month}-${lbl.index}-${i}`}
                  className={styles.monthLabel}
                  style={{ left: `${leftOffset}px` }}
                >
                  {lbl.month}
                </span>
              );
            })}
          </div>

          {/* Heatmap Grid body */}
          <div className={styles.heatmapBody}>
            {/* Weekday indicators (Mon, Wed, Fri) */}
            <div className={styles.weekdayLabels} aria-hidden="true">
              <span></span>
              <span>Mon</span>
              <span></span>
              <span>Wed</span>
              <span></span>
              <span>Fri</span>
              <span></span>
            </div>

            {/* Columns of weeks */}
            <div
              className={styles.gridColumns}
              role="grid"
              aria-label="Study activity calendar"
            >
              {weeks.map((week, weekIdx) => (
                <div
                  key={`week-${weekIdx}`}
                  className={styles.weekCol}
                  role="row"
                >
                  {week.map((cell, dayIdx) => {
                    const cellIndex = weekIdx * 7 + dayIdx;
                    const ariaLabel = `${formatTooltipDate(cell.date)}: ${
                      cell.minutes > 0
                        ? `${cell.minutes} minutes (${cell.count} session${cell.count === 1 ? "" : "s"})`
                        : "No activity"
                    }`;
                    return (
                      <button
                        type="button"
                        key={cell.dateStr}
                        className={`${styles.cell} ${getLevelClass(cell.level)}`}
                        role="gridcell"
                        aria-label={ariaLabel}
                        tabIndex={cellIndex === focusIndex ? 0 : -1}
                        ref={(element) => {
                          cellRefs.current[cellIndex] = element;
                        }}
                        onMouseEnter={(e) => handleCellHover(cell, e)}
                        onMouseLeave={handleCellLeave}
                        onFocus={(e) => handleCellHover(cell, e)}
                        onBlur={handleCellLeave}
                        onKeyDown={(e) => handleCellKeyDown(cellIndex, e)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Heatmap Footer: Streaks & Legend */}
      <div className={styles.heatmapFooter}>
        <div className={styles.heatmapStreakStats}>
          <div className={styles.streakItem}>
            <span>Current Streak:</span>
            <span className={styles.streakVal}>{data.currentStreak} days</span>
          </div>
          <div className={styles.streakItem}>
            <span>Longest Streak:</span>
            <span className={styles.streakVal}>{data.longestStreak} days</span>
          </div>
          <div className={styles.streakItem}>
            <span>Active Days:</span>
            <span className={styles.streakVal}>{data.activeDays}</span>
          </div>
        </div>

        <div className={styles.legend} aria-hidden="true">
          <span>Less</span>
          <div className={styles.legendCells}>
            <div className={`${styles.legendCell} ${styles.cellLvl0}`} />
            <div className={`${styles.legendCell} ${styles.cellLvl1}`} />
            <div className={`${styles.legendCell} ${styles.cellLvl2}`} />
            <div className={`${styles.legendCell} ${styles.cellLvl3}`} />
            <div className={`${styles.legendCell} ${styles.cellLvl4}`} />
          </div>
          <span>More</span>
        </div>
      </div>

      {/* Hover/Focus Tooltip */}
      {tooltip && (
        <div
          className={styles.tooltip}
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
          }}
          role="tooltip"
        >
          <div className={styles.tooltipDate}>
            {formatTooltipDate(tooltip.cell.date)}
          </div>
          <div className={styles.tooltipStats}>
            {formatMinutes(tooltip.cell.minutes)}
            {tooltip.cell.count > 0 &&
              ` • ${tooltip.cell.count} session${tooltip.cell.count === 1 ? "" : "s"}`}
          </div>
        </div>
      )}
    </div>
  );
}
