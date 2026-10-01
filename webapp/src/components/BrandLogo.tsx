import { LOGO_URL as logoUrl } from "../lib/logoUrl";
import styles from "./BrandLogo.module.css";

interface BrandLogoProps {
  size?: "small" | "medium" | "large";
  showText?: boolean;
}

export function BrandLogo({ size = "small", showText = false }: BrandLogoProps) {
  const sizeMap = {
    small: 24,
    medium: 40,
    large: 56,
  };

  const logoSize = sizeMap[size];

  return (
    <div className={`${styles.logo} ${styles[size]}`}>
      <img
        src={logoUrl}
        alt="Learnora"
        width={logoSize}
        height={logoSize}
        className={styles.image}
      />
      {showText && <span className={styles.text}>Learnora</span>}
    </div>
  );
}
