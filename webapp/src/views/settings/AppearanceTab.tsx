import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Icon } from "../../components/Icon";
import type { IconName } from "../../components/icons";
import { ProGate } from "../../components/ProGate";
import { useAppearance } from "../../context/appearance";
import { useToast } from "../../context/toast";
import {
  THEME_PRESETS,
  type BgTexture,
  type FontFamily,
  type FontSize,
  type Mode,
  type SidebarStyle,
} from "../../lib/appearance";
import { CustomThemeStudio } from "./CustomThemeStudio";
import settings from "./settings.module.css";
import styles from "./appearance.module.css";

const MODES: ReadonlyArray<{ id: Mode; title: string; icon: IconName }> = [
  { id: "dark", title: "Dark Mode", icon: "moon" },
  { id: "light", title: "Light Mode", icon: "sun" },
  { id: "system", title: "System Sync", icon: "monitor" },
];

const FONTS: ReadonlyArray<{
  id: FontFamily;
  title: string;
  glyph: string;
  cls: string;
}> = [
  {
    id: "jakarta",
    title: "Plus Jakarta",
    glyph: "Aa",
    cls: styles.fontJakarta,
  },
  { id: "outfit", title: "Outfit", glyph: "Aa", cls: styles.fontOutfit },
  { id: "inter", title: "Inter UI", glyph: "Aa", cls: styles.fontInter },
  { id: "mono", title: "JetBrains Mono", glyph: "{ }", cls: styles.fontMono },
  {
    id: "dyslexic",
    title: "Atkinson Hyperlegible",
    glyph: "Aa",
    cls: styles.fontDyslexic,
  },
];

const SIZES: ReadonlyArray<{
  id: FontSize;
  title: string;
  glyph: string;
  cls: string;
}> = [
  { id: "sm", title: "Compact (13.5px)", glyph: "S", cls: styles.sizeSm },
  { id: "md", title: "Standard (15px)", glyph: "M", cls: styles.sizeMd },
  { id: "lg", title: "Large (16.5px)", glyph: "L", cls: styles.sizeLg },
];

const SIDEBARS: ReadonlyArray<{ id: SidebarStyle; title: string }> = [
  { id: "glass", title: "Glassmorphism" },
  { id: "solid", title: "Solid Canvas" },
  { id: "transparent", title: "Minimal" },
];

const BACKGROUNDS: ReadonlyArray<{ id: BgTexture; title: string }> = [
  { id: "none", title: "Clean Canvas" },
  { id: "noise", title: "Grain Noise" },
  { id: "mesh", title: "Liquid Mesh" },
];

function OptionCard({
  selected,
  title,
  onClick,
  icon,
  className,
}: {
  selected: boolean;
  title: string;
  onClick: () => void;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`${styles.cardOption}${className ? ` ${className}` : ""}`}
      aria-pressed={selected}
      onClick={onClick}
    >
      {icon}
      <span className={styles.optionTitle}>{title}</span>
      <span className={styles.optionBadge} aria-hidden="true">
        ACTIVE
      </span>
    </button>
  );
}

export function AppearanceTab() {
  const { appearance, setAppearance, save, reset } = useAppearance();
  const { showToast } = useToast();

  const activePresetName =
    appearance.accent === "custom"
      ? "Custom Colours"
      : (THEME_PRESETS.find((p) => p.id === appearance.accent)?.name ??
        appearance.accent);

  return (
    <>
      <Card
        as="section"
        variant="elevated"
        radius="lg"
        padding="lg"
        className={settings.card}
        aria-labelledby="settings-appearance-heading"
      >
        <div className={settings.cardHeader}>
          <span className={settings.cardIcon}>
            <Icon name="palette" size={18} />
          </span>
          <div>
            <h3 id="settings-appearance-heading">Workspace Appearance</h3>
            <p>Set the colour, typography, and workspace surfaces.</p>
          </div>
        </div>

        <div className={`${settings.field} ${settings.fieldStack}`}>
          <div className={settings.fieldLabel}>
            <span className={settings.labelText}>Interface Mode</span>
            <p className={settings.fieldDesc}>
              Follow your device theme or choose light or dark.
            </p>
          </div>
          <div className={styles.grid} role="group" aria-label="Interface mode">
            {MODES.map((m) => (
              <OptionCard
                key={m.id}
                selected={appearance.mode === m.id}
                title={m.title}
                onClick={() => setAppearance({ mode: m.id })}
                icon={
                  <span className={styles.optionIcon} aria-hidden="true">
                    <Icon name={m.icon} size={22} />
                  </span>
                }
              />
            ))}
          </div>
        </div>

        <ProGate feature="customAppearance" loadingHeight={340}>
          <div className={`${settings.field} ${settings.fieldStack}`}>
            <div className={settings.fieldLabel}>
              <span className={settings.labelText}>Accent Colour</span>
              <p className={settings.fieldDesc}>Choose an accent preset.</p>
            </div>
            <div
              className={styles.swatchGrid}
              role="group"
              aria-label="Colour presets"
            >
              {THEME_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={styles.swatchCard}
                  data-theme={preset.id}
                  aria-pressed={appearance.accent === preset.id}
                  onClick={() => setAppearance({ accent: preset.id })}
                >
                  <span className={styles.swatchPreview} aria-hidden="true">
                    <span className={styles.swatchDot} />
                  </span>
                  <span className={styles.swatchInfo}>
                    <span className={styles.swatchName}>{preset.name}</span>
                    <span
                      className={styles.swatchActiveIcon}
                      aria-hidden="true"
                    >
                      <Icon name="check" size={14} strokeWidth={2.25} />
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className={`${settings.field} ${settings.fieldStack}`}>
            <div className={`${settings.fieldLabel} ${styles.studioHeading}`}>
              <div>
                <span className={settings.labelText}>Custom Colours</span>
                <p className={settings.fieldDesc}>
                  Build an accent from up to three colours.
                </p>
              </div>
              <span
                className={`${styles.studioBadge}${
                  appearance.accent === "custom"
                    ? ` ${styles.studioBadgeActive}`
                    : ""
                }`}
              >
                ACTIVE
              </span>
            </div>
            <CustomThemeStudio />
          </div>
        </ProGate>

        <div className={`${settings.field} ${settings.fieldStack}`}>
          <div className={settings.fieldLabel}>
            <span className={settings.labelText}>Font Family</span>
            <p className={settings.fieldDesc}>
              Choose a typeface style for the entire workspace. Atkinson
              Hyperlegible is designed for low-vision and dyslexic readers.
            </p>
          </div>
          <div
            className={`${styles.grid} ${styles.gridWide}`}
            role="group"
            aria-label="Font family"
          >
            {FONTS.map((f) => (
              <OptionCard
                key={f.id}
                selected={appearance.font === f.id}
                title={f.title}
                className={f.cls}
                onClick={() => setAppearance({ font: f.id })}
                icon={
                  <span
                    className={`${styles.optionIcon} ${styles.optionIconType}`}
                    aria-hidden="true"
                  >
                    {f.glyph}
                  </span>
                }
              />
            ))}
          </div>
        </div>

        <div className={`${settings.field} ${settings.fieldStack}`}>
          <div className={settings.fieldLabel}>
            <span className={settings.labelText}>Interface Scale</span>
            <p className={settings.fieldDesc}>Change text and control size.</p>
          </div>
          <div
            className={styles.grid}
            role="group"
            aria-label="Interface scale"
          >
            {SIZES.map((s) => (
              <OptionCard
                key={s.id}
                selected={appearance.size === s.id}
                title={s.title}
                className={s.cls}
                onClick={() => setAppearance({ size: s.id })}
                icon={
                  <span
                    className={`${styles.optionIcon} ${styles.optionIconScale}`}
                    aria-hidden="true"
                  >
                    {s.glyph}
                  </span>
                }
              />
            ))}
          </div>
        </div>

        {/* 5. Sidebar framing */}
        <div className={`${settings.field} ${settings.fieldStack}`}>
          <div className={settings.fieldLabel}>
            <span className={settings.labelText}>Sidebar Style</span>
            <p className={settings.fieldDesc}>
              Choose sidebar transparency and background blur
            </p>
          </div>
          <div className={styles.grid} role="group" aria-label="Sidebar style">
            {SIDEBARS.map((s) => (
              <OptionCard
                key={s.id}
                selected={appearance.sidebar === s.id}
                title={s.title}
                onClick={() => setAppearance({ sidebar: s.id })}
              />
            ))}
          </div>
        </div>

        {/* 5b. Background texture */}
        <div className={`${settings.field} ${settings.fieldStack}`}>
          <div className={settings.fieldLabel}>
            <span className={settings.labelText}>
              Atmospheric Background Effect
            </span>
            <p className={settings.fieldDesc}>
              Add texture or animated glowing mesh to background
            </p>
          </div>
          <div
            className={styles.grid}
            role="group"
            aria-label="Background effect"
          >
            {BACKGROUNDS.map((b) => (
              <OptionCard
                key={b.id}
                selected={appearance.bg === b.id}
                title={b.title}
                onClick={() => setAppearance({ bg: b.id })}
              />
            ))}
          </div>
        </div>

        {/* 6. Live preview */}
        <div className={`${settings.field} ${settings.fieldStack}`}>
          <div className={settings.fieldLabel}>
            <span className={settings.labelText}>Preview</span>
            <p className={settings.fieldDesc}>
              Instant real-time preview of your active theme &amp; typography
            </p>
          </div>
          <div className={styles.livePreview}>
            <div className={styles.livePreviewHeader}>
              <div className={styles.livePreviewTitle}>
                <span>Live Interface Preview</span>
              </div>
              <span className={styles.livePreviewBadge}>
                {activePresetName}
              </span>
            </div>
            <div className={styles.livePreviewBody}>
              <div className={styles.livePreviewCard}>
                <h5>Focus Block Complete</h5>
                <p>45 mins of Deep Study logged automatically.</p>
              </div>
              <span className={styles.livePreviewBtn} aria-hidden="true">
                Primary Action →
              </span>
            </div>
          </div>
        </div>
      </Card>

      <div className={styles.actions}>
        <Button
          onClick={() => {
            reset();
            showToast("Appearance settings reset to defaults.");
          }}
        >
          Reset Defaults
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            save();
            showToast("Appearance saved.");
          }}
        >
          Save Appearance
        </Button>
      </div>
    </>
  );
}
