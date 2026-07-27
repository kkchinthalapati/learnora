/* Inline SVG icon set — replaces emoji used as functional icons app-wide.
   24x24 viewBox, stroke-based, currentColor, matching the line-icon
   convention already used for the hamburger/close/timer-ring markup in
   index.html. Filled dots (fill="currentColor" stroke="none") are used
   sparingly for small accent details (calendar day markers, bot eyes). */

const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  folder: '<path d="M3 6.5a1.5 1.5 0 0 1 1.5-1.5h4.379a1.5 1.5 0 0 1 1.06.44l1.122 1.12a1.5 1.5 0 0 0 1.06.44H19.5A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-11Z"/>',
  "upload-cloud": '<path d="M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17.5 8.5 3.75 3.75 0 0 1 17 16"/><path d="M12 20v-9"/><path d="M8.5 14.5 12 11l3.5 3.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  "list-checks": '<path d="M4 6l1.5 1.5L8 5"/><path d="M4 12l1.5 1.5L8 10"/><path d="M4 18l1.5 1.5L8 16"/><line x1="11" y1="6" x2="20" y2="6"/><line x1="11" y1="12" x2="20" y2="12"/><line x1="11" y1="18" x2="20" y2="18"/>',
  "calendar-week": '<rect x="3" y="4.5" width="18" height="16" rx="2"/><line x1="3" y1="9.5" x2="21" y2="9.5"/><line x1="8" y1="2.5" x2="8" y2="6.5"/><line x1="16" y1="2.5" x2="16" y2="6.5"/><rect x="6.5" y="12.5" width="3" height="3" rx="0.5" fill="currentColor" stroke="none"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16" rx="2"/><line x1="3" y1="9.5" x2="21" y2="9.5"/><line x1="8" y1="2.5" x2="8" y2="6.5"/><line x1="16" y1="2.5" x2="16" y2="6.5"/><circle cx="15.5" cy="15" r="1.4" fill="currentColor" stroke="none"/>',
  layers: '<polygon points="12 2.5 2.5 7.5 12 12.5 21.5 7.5 12 2.5"/><polyline points="2.5 12.5 12 17.5 21.5 12.5"/><polyline points="2.5 17.5 12 22.5 21.5 17.5"/>',
  "help-circle": '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 1.9-2.4 3.5"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  bot: '<rect x="4" y="8" width="16" height="11" rx="3"/><line x1="12" y1="3" x2="12" y2="8"/><circle cx="12" cy="3" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="13.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="13.5" r="1.2" fill="currentColor" stroke="none"/><line x1="9" y1="18" x2="15" y2="18"/>',
  settings: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M4.2 7.5l2.6 1.5M17.2 15l2.6 1.5M4.2 16.5l2.6-1.5M17.2 9l2.6-1.5M3 12h3M18 12h3"/>',
  "file-text": '<path d="M6 3.5h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z"/><path d="M14 3.5V8h4"/><line x1="8" y1="12.5" x2="16" y2="12.5"/><line x1="8" y1="16" x2="16" y2="16"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V7"/><path d="M6 7l1 12.5a1.5 1.5 0 0 0 1.5 1.4h7a1.5 1.5 0 0 0 1.5-1.4L18 7"/><line x1="10" y1="11" x2="10" y2="16"/><line x1="14" y1="11" x2="14" y2="16"/>',
  pencil: '<path d="M16.5 4.5a2.1 2.1 0 0 1 3 3L7 20 3 21l1-4L16.5 4.5Z"/>',
  x: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
  "refresh-cw": '<path d="M4 12a8 8 0 0 1 14.2-5"/><path d="M20 12a8 8 0 0 1-14.2 5"/><polyline points="18 3 18.2 7 14 7"/><polyline points="6 21 5.8 17 10 17"/>',
  shuffle: '<path d="M3 6h3.5a4 4 0 0 1 3.2 1.6L15 16.4A4 4 0 0 0 18.3 18H21"/><path d="M3 18h3.5a4 4 0 0 0 3.2-1.6L11 13"/><polyline points="18 3 21 6 18 9"/><polyline points="18 15 21 18 18 21"/>',
  "chevron-down": '<polyline points="5 8.5 12 15.5 19 8.5"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  check: '<polyline points="5 12.5 10 17.5 19 7"/>',
  "alert-triangle": '<path d="M12 3.5 21.5 20h-19L12 3.5Z"/><line x1="12" y1="9.5" x2="12" y2="13.5"/><line x1="12" y1="16.5" x2="12.01" y2="16.5"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.7 6.7 0 0 0 10.5 10.5Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M4.5 4.5l1.8 1.8M17.7 17.7l1.8 1.8M2.5 12h2.5M19 12h2.5M4.5 19.5l1.8-1.8M17.7 6.3l1.8-1.8"/>',
  monitor: '<rect x="3" y="4.5" width="18" height="12" rx="1.5"/><line x1="8" y1="20.5" x2="16" y2="20.5"/><line x1="12" y1="16.5" x2="12" y2="20.5"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  bell: '<path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10Z"/><path d="M10 18.5a2 2 0 0 0 4 0"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><line x1="3" y1="12" x2="21" y2="12"/>',
  key: '<circle cx="8" cy="15" r="3.5"/><path d="M10.5 12.5 19 4"/><path d="M15.5 8 18 10.5"/><path d="M17.5 5.5 20 8"/>',
  smartphone: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><line x1="11" y1="18.5" x2="13" y2="18.5"/>',
  download: '<path d="M12 3v12"/><path d="M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19h14"/>',
  brain: '<path d="M9 4.5a3 3 0 0 0-3 3v1a3 3 0 0 0-1.5 5.6A3 3 0 0 0 7 19.5a3 3 0 0 0 2-.8"/><path d="M15 4.5a3 3 0 0 1 3 3v1a3 3 0 0 1 1.5 5.6A3 3 0 0 1 17 19.5a3 3 0 0 1-2-.8"/><path d="M9 4.5a3 3 0 0 1 3 2.7v9.3a3 3 0 0 1-2 2.8"/><path d="M15 4.5a3 3 0 0 0-3 2.7v9.3a3 3 0 0 0 2 2.8"/>',
  flame: '<path d="M12 21.5c-4 0-6.5-2.6-6.5-6 0-3 2-4.8 2-4.8-.2 1.6.6 2.4.6 2.4-.6-3 1-6 4.4-8.6-.4 2 .2 3.4 1.5 4.8 1.8 1.9 4 4 4 7.2 0 3.4-2.5 5-6 5Z"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2s-.6-1.7-.6-2.7c0-1.4 1.1-2.3 2.6-2.3H18a3 3 0 0 0 3-3c0-4.4-4-8-9-8Z"/><circle cx="7.5" cy="10.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="10.5" cy="7" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="7.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="17.5" cy="11.5" r="1.1" fill="currentColor" stroke="none"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  "log-out": '<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"/><path d="M15 16l4-4-4-4"/><line x1="19" y1="12" x2="9" y2="12"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="9" y1="21" x2="15" y2="21"/>',
  play: '<path d="M8 5.5v13l11-6.5-11-6.5Z"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  star: '<path d="M12 3.5 14.5 9.5 21 10.3 16.2 14.6 17.5 21 12 17.7 6.5 21 7.8 14.6 3 10.3 9.5 9.5 12 3.5Z"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 13 13l-4.5 2.5L11 11l4.5-2.5Z"/>',
  "graduation-cap": '<path d="M12 4 2 9l10 5 10-5-10-5Z"/><path d="M6 11.5v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/><path d="M22 9v6"/>',
  paperclip: '<path d="M8 12.5V7a4 4 0 0 1 8 0v9a2.5 2.5 0 0 1-5 0V8.5"/>',
};

function svg(name, { size = 20, className = "", strokeWidth = 1.75 } = {}) {
  const inner = ICONS[name];
  if (!inner) return "";
  const cls = className ? ` icon-${name} ${className}` : ` icon-${name}`;
  return `<svg class="icon${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;
}

export const Icons = { svg, names: Object.keys(ICONS) };
