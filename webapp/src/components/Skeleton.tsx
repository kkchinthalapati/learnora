import styles from "./Skeleton.module.css";

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  radius?: string;
  className?: string;
  /* What's loading, for screen readers. The wrapper is aria-busy, so one
     label on a group of skeletons is enough — don't label every bar. */
  label?: string;
}

export function Skeleton({
  width = "100%",
  height = 16,
  radius,
  className,
  label,
}: SkeletonProps) {
  return (
    <div
      className={[styles.skeleton, className].filter(Boolean).join(" ")}
      style={{ width, height, borderRadius: radius }}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
