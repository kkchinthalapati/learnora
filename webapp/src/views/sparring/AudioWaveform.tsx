import { useEffect, useMemo, useState } from "react";
import styles from "./sparring.module.css";

export interface AudioWaveformProps {
  isActive?: boolean;
  mode?: "idle" | "listening" | "speaking";
  speaker?: "alex" | "jordan" | "student" | null;
  height?: number;
  barsCount?: number;
  className?: string;
}

export function AudioWaveform({
  isActive = false,
  mode = "idle",
  speaker = "student",
  height = 40,
  barsCount = 20,
  className = "",
}: AudioWaveformProps) {
  const [tick, setTick] = useState(0);

  // Subtle dynamic tick when active for reactive pulse
  useEffect(() => {
    if (!isActive && mode === "idle") return;
    const interval = setInterval(() => {
      setTick((t) => (t + 1) % 100);
    }, 120);
    return () => clearInterval(interval);
  }, [isActive, mode]);

  // Compute heights for each bar
  const bars = useMemo(() => {
    return Array.from({ length: barsCount }, (_, idx) => {
      if (!isActive && mode === "idle") {
        return 12;
      }
      // Sinusoidal wave modified by index, tick, and speaker
      const offset = (idx / barsCount) * Math.PI * 2;
      const speedFactor = speaker === "jordan" ? 2.5 : speaker === "alex" ? 1.6 : 2.0;
      const raw = Math.sin(offset * 2 + (tick * speedFactor * 0.2));
      const normalized = (raw + 1) / 2; // 0 to 1
      const minHeight = 15;
      const maxHeight = height * 0.9;
      return minHeight + normalized * (maxHeight - minHeight);
    });
  }, [barsCount, height, isActive, mode, speaker, tick]);

  const speakerToneClass =
    speaker === "alex"
      ? styles.waveAlex
      : speaker === "jordan"
        ? styles.waveJordan
        : styles.waveStudent;

  return (
    <div
      className={`${styles.waveformContainer} ${speakerToneClass} ${className}`}
      style={{ height }}
      role="img"
      aria-label={
        isActive
          ? `Audio active (${mode}, ${speaker ?? "neutral"})`
          : "Audio idle"
      }
    >
      <div className={styles.waveformBars}>
        {bars.map((barHeight, idx) => (
          <span
            key={idx}
            className={`${styles.waveBar} ${isActive ? styles.waveBarActive : ""}`}
            style={{
              height: `${Math.round(barHeight)}%`,
              animationDelay: `${(idx * 0.05).toFixed(2)}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
