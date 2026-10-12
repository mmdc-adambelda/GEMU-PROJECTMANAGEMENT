import { format, formatDistanceToNowStrict, isToday, isValid, parseISO, startOfDay } from "date-fns";

/** `YYYY-MM-DD` (date column) -> local Date at midnight, without timezone shifting. */
export function parseDay(d: string | null | undefined): Date | null {
  if (!d) return null;
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  const date = new Date(y, m - 1, day);
  return isValid(date) ? date : null;
}

export const toDay = (d: Date) => format(d, "yyyy-MM-dd");
export const todayStr = () => toDay(new Date());

export function fmtDate(d: string | null | undefined, pattern = "MMM d") {
  const p = parseDay(d);
  return p ? format(p, pattern) : "";
}

export function fmtDateTime(iso: string) {
  const d = parseISO(iso);
  return isValid(d) ? format(d, "MMM d, yyyy h:mm a") : "";
}

export function timeAgo(iso: string) {
  const d = parseISO(iso);
  if (!isValid(d)) return "";
  const diff = Date.now() - d.getTime();
  if (diff < 45_000) return "just now";
  return `${formatDistanceToNowStrict(d)} ago`;
}

export const isOverdue = (due: string | null | undefined, done: boolean) => {
  const p = parseDay(due);
  return !!p && !done && p < startOfDay(new Date());
};

export const isDueToday = (due: string | null | undefined) => {
  const p = parseDay(due);
  return !!p && isToday(p);
};

/** 90 -> "1h 30m" */
export function fmtMinutes(min: number | null | undefined) {
  if (!min) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ");
}

/** "1h 30m", "90m", "2h", "1.5h" -> minutes (null when unparsable) */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  let total = 0;
  const re = /(\d+(?:\.\d+)?)\s*(h|m)?/g;
  let match: RegExpExecArray | null;
  let any = false;
  while ((match = re.exec(s))) {
    if (!match[0]) break;
    any = true;
    const n = parseFloat(match[1]);
    total += match[2] === "h" ? n * 60 : n;
  }
  return any && total > 0 ? Math.round(total) : null;
}

/** Today as YYYY-MM-DD in an IANA timezone (falls back to UTC for invalid zones). */
export function todayIn(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
