/**
 * Dates in the group's time zone. Nairobi is UTC+3 all year (no DST), and
 * the server runs in UTC — so `new Date().toISOString().split("T")[0]` is
 * yesterday between 00:00 and 03:00 Nairobi time. Use these instead.
 */
const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;

/** The calendar date (YYYY-MM-DD) of `at` in Nairobi. */
export function nairobiDate(at: Date): string {
  return new Date(at.getTime() + NAIROBI_OFFSET_MS).toISOString().split("T")[0];
}

/** Today's date (YYYY-MM-DD) in Nairobi. */
export function nairobiToday(now: Date = new Date()): string {
  return nairobiDate(now);
}

/** `days` after a YYYY-MM-DD date, as YYYY-MM-DD. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().split("T")[0];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A YYYY-MM-DD string, a timestamp string, or a Date, as a Nairobi YYYY-MM-DD. */
function toDay(date: string | Date): string {
  if (date instanceof Date) return nairobiDate(date);
  return date.length === 10 ? date : nairobiDate(new Date(date));
}

/**
 * A date as people say it: "Tue 27 Oct", with the year only when it isn't
 * this year ("Mon 4 Jan 2027"). Never "Today" — use this for text that is
 * stored or sent (notifications, SMS, fine reasons) and read later.
 */
export function formatDate(date: string | Date, today: string = nairobiToday()): string {
  const [y, m, d] = toDay(date).split("-").map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wd} ${d} ${MONTHS[m - 1]}${String(y) === today.slice(0, 4) ? "" : ` ${y}`}`;
}

/** Like formatDate, but "Today"/"Tomorrow"/"Yesterday" when close. For screens. */
export function formatDay(date: string | Date, today: string = nairobiToday()): string {
  const day = toDay(date);
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  if (day === addDays(today, -1)) return "Yesterday";
  return formatDate(day, today);
}

/** "Tue 27 Oct – Mon 4 Jan 2027" (each side shows its year only when needed). */
export function formatRange(from: string | Date, to: string | Date, today: string = nairobiToday()): string {
  return `${formatDate(from, today)} – ${formatDate(to, today)}`;
}

/** A moment, in Nairobi time: "Today, 14:05" or "Tue 27 Oct, 14:05". */
export function formatDateTime(at: string | Date, today: string = nairobiToday()): string {
  const t = new Date(new Date(at).getTime() + NAIROBI_OFFSET_MS).toISOString().slice(11, 16);
  return `${formatDay(at, today)}, ${t}`;
}
