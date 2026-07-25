/* =========================================================================
   DATE PICKER

   The browser's native picker for <input type="date"> is small, unstyleable
   and — as testing put it — "a struggle" at the size Chrome renders it. This
   replaces it with a popover that matches the rest of the app: readable type,
   40px day targets, and full keyboard support.

   The <input type="date"> itself is deliberately kept as the source of truth,
   so every existing `.value` read and `change` listener keeps working; only
   the pointer path to the native calendar is intercepted.
   ========================================================================= */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/* Local-time YYYY-MM-DD. `toISOString()` is UTC and rolls the date backwards
   for anyone west of Greenwich in the evening. */
function isoOf(date) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

function parseISO(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/* Monday-first column index, matching the weekday header. */
function mondayIndex(date) {
  return (date.getDay() + 6) % 7;
}

let openPicker = null;

function closeOpenPicker() {
  if (!openPicker) return;
  const { popover, onDocPointerDown, onDocKeydown, onReposition, input } = openPicker;
  document.removeEventListener("pointerdown", onDocPointerDown, true);
  document.removeEventListener("keydown", onDocKeydown, true);
  window.removeEventListener("resize", onReposition);
  window.removeEventListener("scroll", onReposition, true);

  // Hand focus back to the field before the popover goes away. Callers can
  // rely on the input's blur firing normally afterwards — the inline due-date
  // editor saves on blur, and would otherwise be stranded open once focus
  // vanished with the removed popover.
  const focusWasInside = popover.contains(document.activeElement);
  popover.remove();
  input.setAttribute("aria-expanded", "false");
  openPicker = null;
  if (focusWasInside && input.isConnected) input.focus();
}

function positionPopover(popover, input) {
  const rect = input.getBoundingClientRect();
  const width = popover.offsetWidth;
  const height = popover.offsetHeight;
  const gap = 8;

  let left = rect.left;
  if (left + width > window.innerWidth - gap) left = window.innerWidth - width - gap;
  if (left < gap) left = gap;

  // Flip above the field when there isn't room beneath it.
  let top = rect.bottom + gap;
  if (top + height > window.innerHeight - gap) {
    const above = rect.top - height - gap;
    if (above >= gap) top = above;
    else top = Math.max(gap, window.innerHeight - height - gap);
  }

  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
}

export const DatePicker = {
  /* Marks the input so a second attach() is a no-op — bindings run on every
     task re-render and duplicate listeners would open two popovers. */
  attach(input) {
    if (!input || input.dataset.datepickerBound === "1") return;
    input.dataset.datepickerBound = "1";
    input.setAttribute("aria-haspopup", "dialog");
    input.setAttribute("aria-expanded", "false");

    const openFromPointer = (e) => {
      // Suppresses the native calendar without losing the click.
      e.preventDefault();
      if (openPicker && openPicker.input === input) {
        closeOpenPicker();
        return;
      }
      input.focus();
      this.open(input);
    };

    input.addEventListener("mousedown", openFromPointer);
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" && (e.altKey || e.metaKey)) {
        e.preventDefault();
        this.open(input);
      }
    });
  },

  open(input) {
    closeOpenPicker();

    const selected = parseISO(input.value);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let cursor = new Date(selected || today);
    cursor.setDate(1);
    let focusedDate = new Date(selected || today);

    const popover = document.createElement("div");
    popover.className = "datepicker-popover glass-panel";
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-modal", "false");
    popover.setAttribute("aria-label", "Choose a date");

    const header = document.createElement("div");
    header.className = "datepicker-header";

    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "datepicker-nav";
    prev.setAttribute("aria-label", "Previous month");
    prev.textContent = "‹";

    const title = document.createElement("div");
    title.className = "datepicker-title";
    title.setAttribute("aria-live", "polite");

    const next = document.createElement("button");
    next.type = "button";
    next.className = "datepicker-nav";
    next.setAttribute("aria-label", "Next month");
    next.textContent = "›";

    header.append(prev, title, next);

    const weekRow = document.createElement("div");
    weekRow.className = "datepicker-weekdays";
    WEEKDAYS.forEach((w) => {
      const cell = document.createElement("span");
      cell.textContent = w;
      cell.setAttribute("aria-hidden", "true");
      weekRow.appendChild(cell);
    });

    const grid = document.createElement("div");
    grid.className = "datepicker-grid";
    grid.setAttribute("role", "grid");

    const footer = document.createElement("div");
    footer.className = "datepicker-footer";

    const todayBtn = document.createElement("button");
    todayBtn.type = "button";
    todayBtn.className = "datepicker-action";
    todayBtn.textContent = "Today";

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "datepicker-action datepicker-action-muted";
    clearBtn.textContent = "Clear";

    footer.append(todayBtn, clearBtn);
    popover.append(header, weekRow, grid, footer);
    document.body.appendChild(popover);

    const commit = (value) => {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      closeOpenPicker();
      input.focus();
    };

    const render = () => {
      const year = cursor.getFullYear();
      const month = cursor.getMonth();
      title.textContent = `${MONTHS[month]} ${year}`;
      grid.innerHTML = "";

      const firstOfMonth = new Date(year, month, 1);
      const lead = mondayIndex(firstOfMonth);
      const totalDays = new Date(year, month + 1, 0).getDate();
      const selectedISO = input.value;
      const todayISO = isoOf(today);

      for (let i = 0; i < lead; i++) {
        const filler = document.createElement("span");
        filler.className = "datepicker-day is-empty";
        filler.setAttribute("aria-hidden", "true");
        grid.appendChild(filler);
      }

      for (let day = 1; day <= totalDays; day++) {
        const date = new Date(year, month, day);
        const iso = isoOf(date);
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "datepicker-day";
        cell.textContent = String(day);
        cell.dataset.date = iso;
        cell.setAttribute("role", "gridcell");
        cell.setAttribute("aria-label", `${MONTHS[month]} ${day}, ${year}`);
        if (iso === todayISO) cell.classList.add("is-today");
        if (iso === selectedISO) {
          cell.classList.add("is-selected");
          cell.setAttribute("aria-selected", "true");
        }
        // Only one cell stays tabbable; the arrow keys move between them.
        cell.tabIndex = iso === isoOf(focusedDate) ? 0 : -1;
        cell.addEventListener("click", () => commit(iso));
        grid.appendChild(cell);
      }
    };

    const focusCell = () => {
      const target = grid.querySelector(`[data-date="${isoOf(focusedDate)}"]`);
      if (target) {
        target.tabIndex = 0;
        target.focus();
      }
    };

    const moveFocus = (days) => {
      const nextDate = new Date(focusedDate);
      nextDate.setDate(nextDate.getDate() + days);
      focusedDate = nextDate;
      if (
        nextDate.getMonth() !== cursor.getMonth() ||
        nextDate.getFullYear() !== cursor.getFullYear()
      ) {
        cursor = new Date(nextDate.getFullYear(), nextDate.getMonth(), 1);
      }
      render();
      focusCell();
    };

    const shiftMonth = (delta) => {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1);
      render();
    };

    prev.addEventListener("click", () => shiftMonth(-1));
    next.addEventListener("click", () => shiftMonth(1));
    todayBtn.addEventListener("click", () => commit(isoOf(today)));
    clearBtn.addEventListener("click", () => commit(""));

    const onDocPointerDown = (e) => {
      if (popover.contains(e.target) || e.target === input) return;
      closeOpenPicker();
    };

    const onDocKeydown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeOpenPicker();
        input.focus();
        return;
      }
      if (!popover.contains(document.activeElement)) return;
      switch (e.key) {
        case "ArrowLeft": e.preventDefault(); moveFocus(-1); break;
        case "ArrowRight": e.preventDefault(); moveFocus(1); break;
        case "ArrowUp": e.preventDefault(); moveFocus(-7); break;
        case "ArrowDown": e.preventDefault(); moveFocus(7); break;
        case "PageUp": e.preventDefault(); shiftMonth(-1); break;
        case "PageDown": e.preventDefault(); shiftMonth(1); break;
        default: break;
      }
    };

    const onReposition = () => positionPopover(popover, input);

    document.addEventListener("pointerdown", onDocPointerDown, true);
    document.addEventListener("keydown", onDocKeydown, true);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);

    openPicker = { popover, input, onDocPointerDown, onDocKeydown, onReposition };
    input.setAttribute("aria-expanded", "true");

    render();
    positionPopover(popover, input);
    focusCell();
  },

  close: closeOpenPicker,
};
