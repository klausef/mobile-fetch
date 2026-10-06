export const colors = {
  red: "#e1251b",
  redDeep: "#b01710",
  gold: "#ffc72c",
  ink: "#14141a",
  blue: "#1b3fd8",
  maroon: "#5c2620",
  brick: "#a93226",
  royal: "#2e3a8c",
  background: "#ffffff",
  card: "#ffffff",
  secondary: "#fdeceb",
  muted: "#f7f1f0",
  border: "#efe3e1",
  line: "#f2e8e7",
  textMuted: "#6f6462",
  textFaint: "#9b8f8d",
  success: "#1c7c4a",
  successSoft: "#e7f5ec",
  warning: "#a06a00",
  warningSoft: "#fff5e0",
  danger: "#b01710",
  dangerSoft: "#fdeceb",
  overlay: "rgba(20, 20, 26, 0.45)",
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const type = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: "800" as const, letterSpacing: -0.6 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: "700" as const, letterSpacing: -0.3 },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: "700" as const },
  body: { fontSize: 15, lineHeight: 21, fontWeight: "400" as const },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: "600" as const },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "600" as const },
  small: { fontSize: 13, lineHeight: 18, fontWeight: "400" as const },
  tiny: { fontSize: 11, lineHeight: 15, fontWeight: "600" as const, letterSpacing: 0.6 },
} as const;

export const touch = {
  minHeight: 46,
  tapTarget: 44,
  iconTop: 50,
  bottomBar: 70,
} as const;

export const scroll = {
  top: 12,
  bottom: 24,
  cardGap: 12,
  sectionGap: 16,
} as const;

export const shadow = {
  card: {
    shadowColor: "#5c2620",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  raised: {
    shadowColor: "#5c2620",
    shadowOpacity: 0.14,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
} as const;

export const font = type;
export const WaveGradient = { name: "icon", size: 24, color: "#fff" };
