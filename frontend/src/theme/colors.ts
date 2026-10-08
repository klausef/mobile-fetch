/**
 * The palette, in one place.
 *
 * Tailwind reads this file (`tailwind.config.js` requires it), so a class like
 * `bg-brand` and any raw color use the same value and cannot drift apart.
 */
export const colors = {
  brand: {
    DEFAULT: "#d92d20",
    dark: "#a21911",
    soft: "#fdecea",
  },
  gold: {
    DEFAULT: "#f5b301",
    soft: "#fdf3d7",
  },
  ink: "#1c1917",
  paper: "#faf7f2",
  card: "#ffffff",
  line: "#e7e0d8",
  muted: "#78716c",
  subtle: "#a8a29e",
  success: "#15803d",
  successSoft: "#dcfce7",
  warning: "#b45309",
  warningSoft: "#fef3c7",
  danger: "#dc2626",
  dangerSoft: "#fee2e2",
  info: "#1d4ed8",
  infoSoft: "#dbeafe",
} as const;

export default colors;
