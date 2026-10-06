/** Small display helpers with no dependency on `Intl`. */
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function timeLabel(at: number): string {
  if (!Number.isFinite(at) || at <= 0) return "";
  const date = new Date(at);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function whenLabel(at: number): string {
  if (!Number.isFinite(at) || at <= 0) return "";
  const date = new Date(at);
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (at >= startOfToday) return `Today · ${timeLabel(at)}`;
  if (at >= startOfToday - dayMs)
    return `Yesterday · ${timeLabel(at)}`;
  return `${date.getDate()} ${MONTHS[date.getMonth()]} · ${timeLabel(at)}`;
}

export function formatPeso(amount: number): string {
  if (!Number.isFinite(amount)) return "₱0.00";
  const fixed = Math.abs(amount).toFixed(2);
  const [whole, cents] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${amount < 0 ? "−" : ""}₱${grouped}.${cents}`;
}

export function countLabel(
  n: number,
  singular: string,
  plural?: string,
): string {
  return `${n} ${n === 1 ? singular : (plural ?? `${singular}s`)}`;
}

export function durationFromMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0 min";
  const totalMinutes = Math.round(ms / 60_000);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
