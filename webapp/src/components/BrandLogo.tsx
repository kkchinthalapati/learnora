import { LearnoraMark } from "./LearnoraMark";
import styles from "./BrandLogo.module.css";

interface BrandLogoProps {
  size?: "small" | "medium" | "large";
  showText?: boolean;
}

/* The same margin-and-tick mark the top bar draws, inline so it follows the
   theme and accent. It replaced a raster wordmark (learnora.jpg) in a
   lowercase geometric sans and violet that read as another study app's. */
export function BrandLogo({ size = "small", showText = false }: BrandLogoProps) {
  const sizeMap = {
    small: 24,
    medium: 40,
    large: 56,
  };

  return (
    <div className={`${styles.logo} ${styles[size]}`}>
      <LearnoraMark size={sizeMap[size]} title={showText ? undefined : "Learnora"} />
      {showText && <span className={styles.text}>Learnora</span>}
    </div>
  );
}
