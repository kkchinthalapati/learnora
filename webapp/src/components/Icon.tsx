import { ICONS, type IconName } from "./icons";

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
  /* Icons are decorative by default (the vanilla registry hard-codes
     aria-hidden). Pass a label only when the icon is the sole content of a
     control and nothing else names it. */
  label?: string;
}

export function Icon({
  name,
  size = 20,
  className = "",
  strokeWidth = 1.75,
  style,
  label,
}: IconProps) {
  return (
    <svg
      style={style}
      className={`icon icon-${name}${className ? ` ${className}` : ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  );
}
