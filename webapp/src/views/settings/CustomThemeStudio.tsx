import { useCallback, useId, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { Icon } from "../../components/Icon";
import { useToast } from "../../context/toast";
import { useAppearance } from "../../context/appearance";
import {
  CUSTOM_THEME_MAX_COLORS,
  addCustomColour,
  removeCustomColour,
  surpriseCustomTheme,
} from "../../lib/appearance";
import { clamp, hsvToHex, parseHex, rgbToHex, rgbToHsv } from "../../lib/color";
import styles from "./appearance.module.css";

/* Custom Colour Studio — ports index.html:1270-1358 + js/ui.js:744-986 +
 * js/main.js:814-922.
 *
 * The picker's HSV is held apart from the hex list for the reason the vanilla
 * documented at js/ui.js:829-831: converting a hex back to HSV loses the hue
 * whenever saturation or value hits 0, so the handle would snap to red as you
 * dragged into a corner. Rather than the vanilla's `_pickerState` cache
 * invalidated by hand, the local state carries the hex it was derived from and
 * is recomputed during render whenever the active stop changes underneath it
 * — same effect, no cache to forget to clear. */

interface EyeDropperResult {
  sRGBHex: string;
}
interface EyeDropperCtor {
  new (): { open: () => Promise<EyeDropperResult> };
}

function supportsEyeDropper(): boolean {
  return typeof window !== "undefined" && "EyeDropper" in window;
}

/* Pointer capture keeps the drag alive when the cursor leaves the element and
   makes one code path serve mouse, touch and pen (js/main.js:818-848). */
function useDragArea(onMove: (x: number, y: number) => void) {
  const dragging = useRef(false);

  const emit = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      onMove(
        r.width ? clamp((e.clientX - r.left) / r.width, 0, 1) : 0,
        r.height ? clamp((e.clientY - r.top) / r.height, 0, 1) : 0,
      );
    },
    [onMove],
  );

  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      e.preventDefault();
      dragging.current = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* capture can throw if the pointer is already gone; the flag above is
           the real drag state, so the gesture still works without it */
      }
      emit(e);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (dragging.current) emit(e);
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      if (!dragging.current) return;
      dragging.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    },
    /* Touch drags get cancelled when the browser claims the gesture — without
       this the control would stay latched to the pointer. */
    onPointerCancel: (e: PointerEvent<HTMLElement>) => {
      if (!dragging.current) return;
      dragging.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    },
  };
}

export function CustomThemeStudio() {
  const { customTheme, setCustomTheme, resetCustomColours } = useAppearance();
  const { showToast } = useToast();
  const intensityId = useId();

  const activeHex =
    customTheme.colors[customTheme.activeIndex] ?? customTheme.colors[0];

  const [picker, setPicker] = useState(() => ({
    hex: activeHex,
    ...rgbToHsv(parseHex(activeHex)!),
  }));
  /* Recompute during render rather than in an effect: the value is a pure
     function of the active stop, and an effect would paint one frame with the
     stale handle position. */
  const hsv =
    picker.hex === activeHex
      ? picker
      : { hex: activeHex, ...rgbToHsv(parseHex(activeHex)!) };

  const [hexText, setHexText] = useState(activeHex);
  const [hexTextFor, setHexTextFor] = useState(activeHex);
  const [hexInvalid, setHexInvalid] = useState(false);
  /* Same trick for the text field — but only when the user isn't mid-edit,
     mirroring the vanilla's `document.activeElement !== input` guard. */
  const shownHexText = hexTextFor === activeHex ? hexText : activeHex;

  /* `hsv` and `customTheme` change on most renders, so reading them through a
     ref keeps `setPickerHsv` — and with it the two drag bindings below —
     stable across a drag. Rebuilding those callbacks on every pointermove
     would tear down and re-add the handlers mid-gesture. */
  const latest = useRef({ customTheme, hsv });
  latest.current = { customTheme, hsv };

  const setPickerHsv = useCallback(
    (patch: { h?: number; s?: number; v?: number }) => {
      const { customTheme: theme, hsv: cur } = latest.current;
      const next = {
        h: patch.h != null ? ((patch.h % 360) + 360) % 360 : cur.h,
        s: patch.s != null ? clamp(patch.s, 0, 1) : cur.s,
        v: patch.v != null ? clamp(patch.v, 0, 1) : cur.v,
      };
      const hex = hsvToHex(next.h, next.s, next.v);
      const colors = [...theme.colors];
      colors[theme.activeIndex] = hex;
      setPicker({ hex, ...next });
      setHexText(hex);
      setHexTextFor(hex);
      setHexInvalid(false);
      setCustomTheme({ ...theme, colors });
    },
    [setCustomTheme],
  );

  const svDrag = useDragArea(
    useCallback((x, y) => setPickerHsv({ s: x, v: 1 - y }), [setPickerHsv]),
  );
  const hueDrag = useDragArea(
    useCallback((x) => setPickerHsv({ h: x * 360 }), [setPickerHsv]),
  );

  function onSvKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 0.1 : 0.02;
    const moves: Record<string, { s?: number; v?: number }> = {
      ArrowLeft: { s: -step },
      ArrowRight: { s: step },
      ArrowUp: { v: step },
      ArrowDown: { v: -step },
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    setPickerHsv({
      s: move.s != null ? hsv.s + move.s : hsv.s,
      v: move.v != null ? hsv.v + move.v : hsv.v,
    });
  }

  function onHueKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = e.shiftKey ? 15 : 3;
    setPickerHsv({ h: hsv.h + (e.key === "ArrowRight" ? step : -step) });
  }

  function applyHex(value: string): boolean {
    const rgb = parseHex(value);
    if (!rgb) return false;
    const hex = rgbToHex(rgb);
    const colors = [...customTheme.colors];
    colors[customTheme.activeIndex] = hex;
    setCustomTheme({ ...customTheme, colors });
    return true;
  }

  async function onEyedropper() {
    try {
      const Ctor = (window as unknown as { EyeDropper: EyeDropperCtor })
        .EyeDropper;
      const { sRGBHex } = await new Ctor().open();
      applyHex(sRGBHex);
    } catch {
      /* user pressed Escape — nothing to do */
    }
  }

  const atMax = customTheme.colors.length >= CUSTOM_THEME_MAX_COLORS;

  return (
    <div className={styles.studio}>
      <div
        className={styles.svField}
        role="slider"
        tabIndex={0}
        aria-label="Colour saturation and brightness. Use arrow keys to adjust."
        aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(
          hsv.v * 100,
        )}%`}
        style={{ ["--custom-sv-hue" as string]: String(Math.round(hsv.h)) }}
        onKeyDown={onSvKeyDown}
        {...svDrag}
      >
        <div
          className={styles.svHandle}
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            background: activeHex,
          }}
        />
      </div>

      <div
        className={styles.hueTrack}
        role="slider"
        tabIndex={0}
        aria-label="Hue"
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={Math.round(hsv.h)}
        style={{ ["--custom-sv-hue" as string]: String(Math.round(hsv.h)) }}
        onKeyDown={onHueKeyDown}
        {...hueDrag}
      >
        <div
          className={styles.hueHandle}
          style={{ left: `${(hsv.h / 360) * 100}%` }}
        />
      </div>

      <div className={styles.hexRow}>
        <span
          className={styles.hexSwatch}
          style={{ backgroundColor: activeHex }}
          aria-hidden="true"
        />
        <input
          type="text"
          className={`${styles.hexInput}${hexInvalid ? ` ${styles.hexInvalid}` : ""}`}
          value={shownHexText}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          aria-label="Hex colour value"
          aria-invalid={hexInvalid || undefined}
          onChange={(e) => {
            const value = e.target.value;
            setHexText(value);
            setHexTextFor(activeHex);
            const ok = applyHex(value);
            setHexInvalid(!ok);
            /* A valid entry re-keys the text to whatever it produced, so the
               field keeps the user's casing until they leave it. */
            if (ok) setHexTextFor(rgbToHex(parseHex(value)!));
          }}
          onBlur={() => {
            /* Discard a half-typed value rather than leaving the field out of
               sync (js/main.js:880-884). */
            setHexInvalid(false);
            setHexText(activeHex);
            setHexTextFor(activeHex);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        {/* EyeDropper is Chromium-only — the button is absent everywhere else,
            rather than present-but-hidden as in the vanilla. */}
        {supportsEyeDropper() && (
          <button
            type="button"
            className={styles.eyedropperBtn}
            title="Pick a colour from anywhere on your screen"
            aria-label="Pick a colour from anywhere on your screen"
            onClick={() => void onEyedropper()}
          >
            <Icon name="eyedropper" size={18} />
          </button>
        )}
      </div>

      <div className={styles.swatchRow}>
        {customTheme.colors.map((hex, i) => (
          <span className={styles.stopWrap} key={`${hex}-${i}`}>
            <button
              type="button"
              className={styles.stop}
              style={{ backgroundColor: hex }}
              aria-label={`Edit colour ${i + 1}, ${hex}`}
              aria-pressed={i === customTheme.activeIndex}
              onClick={() => setCustomTheme({ ...customTheme, activeIndex: i })}
            />
            {customTheme.colors.length > 1 && (
              <button
                type="button"
                className={styles.stopRemove}
                aria-label={`Remove colour ${i + 1}`}
                onClick={() =>
                  setCustomTheme(removeCustomColour(customTheme, i))
                }
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>

      <button
        type="button"
        className={styles.addColourBtn}
        disabled={atMax}
        onClick={() => setCustomTheme(addCustomColour(customTheme))}
      >
        <span className={styles.addPlus} aria-hidden="true">
          +
        </span>{" "}
        Add Colour
      </button>

      <div className={styles.controlsTitle}>Controls</div>
      <div className={styles.intensityRow}>
        <label htmlFor={intensityId}>Colour Intensity</label>
        <span className={styles.intensityValue}>{customTheme.intensity}%</span>
      </div>
      <input
        id={intensityId}
        type="range"
        className={styles.intensitySlider}
        min={0}
        max={100}
        value={customTheme.intensity}
        onChange={(e) =>
          setCustomTheme({ ...customTheme, intensity: Number(e.target.value) })
        }
      />

      <div className={styles.actionRow}>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={() => setCustomTheme(surpriseCustomTheme())}
        >
          Surprise Me
        </button>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={() => {
            resetCustomColours();
            showToast("Custom colours reset to the Learnora default.");
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
