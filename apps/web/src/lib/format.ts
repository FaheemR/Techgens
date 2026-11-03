const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function toMs(value: string | number | Date | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const ms = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** "just now", "5m ago", "3h ago", "2d ago", "in 4d", or a short date beyond two weeks. */
export function relativeTime(
  value: string | number | Date | null | undefined,
  now: number = Date.now(),
): string {
  const ms = toMs(value);
  if (ms === null) return "—";
  const diff = now - ms;
  const abs = Math.abs(diff);
  const future = diff < 0;
  // `now` is refreshed on an interval, so very recent events can look slightly in the future.
  if (diff > -90_000 && diff < 45_000) return "just now";
  let text: string;
  if (abs < HOUR) text = `${Math.round(abs / MINUTE)}m`;
  else if (abs < DAY) text = `${Math.round(abs / HOUR)}h`;
  else if (abs < 14 * DAY) text = `${Math.round(abs / DAY)}d`;
  else return formatDate(ms);
  return future ? `in ${text}` : `${text} ago`;
}

export function formatDate(value: string | number | Date | null | undefined): string {
  const ms = toMs(value);
  if (ms === null) return "—";
  const date = new Date(ms);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function formatDateTime(value: string | number | Date | null | undefined): string {
  const ms = toMs(value);
  if (ms === null) return "—";
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(value: string | number | Date | null | undefined): string {
  const ms = toMs(value);
  if (ms === null) return "—";
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Elapsed time between two instants (end defaults to now): "42s", "3m 12s", "2h 5m", "3d 4h". */
export function formatDuration(
  start: string | number | Date | null | undefined,
  end?: string | number | Date | null,
): string {
  const s = toMs(start);
  if (s === null) return "—";
  const e = toMs(end) ?? Date.now();
  const sec = Math.max(0, Math.round((e - s) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ${min % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

const CREDIT_FORMAT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/**
 * AI credits for display: thousands separators, at most two decimals and no trailing zeros ("3,000", "12.5", "0.05");
 * tiny positive amounts read "< 0.01" rather than "0" or "0.0020". "—" for missing values.
 */
export function credits(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value > 0 && value < 0.005) return "< 0.01";
  const text = CREDIT_FORMAT.format(value);
  return text === "-0" ? "0" : text;
}

/** "42%"; a tiny non-zero share reads "< 1%" instead of rounding to "0%". */
export function percent(ratio: number, digits = 0): string {
  if (!Number.isFinite(ratio)) return "—";
  const pct = ratio * 100;
  const step = 1 / 10 ** digits;
  if (pct > 0 && pct < step / 2) return `< ${step}%`;
  return `${pct.toFixed(digits)}%`;
}

export function ratio(value: number | null | undefined, total: number | null | undefined): number {
  if (!value || !total || total <= 0) return 0;
  return value / total;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Who did something, for display: "CEO (you)", an agent's name (by id or name), or a humanised source. */
export function actorName(
  actor: string | null | undefined,
  agentNames?: ReadonlyMap<string, string>,
): string {
  if (!actor) return "Unknown";
  if (actor.toLowerCase() === "ceo") return "CEO (you)";
  const name = agentNames?.get(actor);
  if (name) return name;
  return UUID.test(actor) ? "An agent" : humanize(actor);
}

/** "in_progress" → "In progress", "merge_to_main" → "Merge to main". */
export function humanize(value: string | null | undefined): string {
  if (!value) return "";
  const text = value.replace(/[_.-]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function compactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/** `<input type="date">` value → ISO timestamp at UTC noon (stable calendar day across time zones). */
export function dateInputToIso(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return new Date(`${value}T12:00:00.000Z`).toISOString();
}

export function isoToDateInput(value: string | null | undefined): string {
  if (!value) return "";
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toISOString().slice(0, 10);
}

export function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : "—";
}

export function shortId(id: string | null | undefined): string {
  if (!id) return "—";
  return id.length > 10 ? id.slice(0, 8) : id;
}

/** Best-effort plain-English rendering of common 5-field cron expressions. */
export function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [min, hour, dom, mon, dow] = parts as [string, string, string, string, string];
  const time =
    /^\d+$/.test(min) && /^\d+$/.test(hour) ? `${hour.padStart(2, "0")}:${min.padStart(2, "0")} UTC` : null;
  const days: Record<string, string> = {
    "*": "every day",
    "1-5": "on weekdays",
    "MON-FRI": "on weekdays",
    "0,6": "on weekends",
    "1": "every Monday",
    MON: "every Monday",
    "2": "every Tuesday",
    "3": "every Wednesday",
    "4": "every Thursday",
    "5": "every Friday",
    FRI: "every Friday",
    "6": "every Saturday",
    "0": "every Sunday",
    "7": "every Sunday",
  };
  if (min.startsWith("*/") && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    return `Every ${min.slice(2)} minutes`;
  }
  if (/^\d+$/.test(min) && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    return `Hourly at :${min.padStart(2, "0")}`;
  }
  if (time && dom === "*" && mon === "*" && days[dow.toUpperCase()]) {
    const when = days[dow.toUpperCase()] ?? "";
    return `${when.charAt(0).toUpperCase()}${when.slice(1)} at ${time}`;
  }
  if (time && /^\d+$/.test(dom) && mon === "*" && dow === "*") {
    return `Monthly on day ${dom} at ${time}`;
  }
  return expr;
}

/** Formats a calendar day key ("YYYY-MM-DD") without time-zone drift. */
export function formatDay(day: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return new Date(`${day}T12:00:00.000Z`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }
  return formatDate(day);
}
