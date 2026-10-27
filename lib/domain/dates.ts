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

/**
 * A YYYY-MM-DD date as people say it: "Tue 27 Oct", with the year only when
 * it isn't this year ("Mon 5 Jan 2027"). "Today"/"Tomorrow" when close.
 */
export function formatDay(date: string, today: string = nairobiToday()): string {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  const [y, m, d] = date.split("-").map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wd} ${d} ${MONTHS[m - 1]}${String(y) === today.slice(0, 4) ? "" : ` ${y}`}`;
}
