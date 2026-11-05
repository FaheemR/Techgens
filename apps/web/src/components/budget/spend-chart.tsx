"use client";

import { credits, formatDay } from "@/lib/format";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;

/** Axis labels need the precision of the tick step ("0.005", "0.625"), not the "< 0.01" rounding of `credits()`. */
function tickLabel(value: number, step: number): string {
  let decimals = 0;
  while (decimals < 4 && Math.abs(Math.round(step * 10 ** decimals) - step * 10 ** decimals) > 1e-9)
    decimals++;
  return value.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(value)));
  const f = value / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

/** Fills missing days (YYYY-MM-DD keys) with zero so the chart has one bar per day. */
export function fillDays(
  daily: ReadonlyArray<{ day: string; credits: number }>,
  days: number,
): Array<{ day: string; credits: number }> {
  if (!daily.every((d) => /^\d{4}-\d{2}-\d{2}/.test(d.day))) return [...daily];
  const byDay = new Map(daily.map((d) => [d.day.slice(0, 10), d.credits]));
  const today = new Date();
  const end = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const out: Array<{ day: string; credits: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = new Date(end - i * DAY).toISOString().slice(0, 10);
    out.push({ day: key, credits: byDay.get(key) ?? 0 });
  }
  return out;
}

/** Daily spend bar chart (pure Tailwind/CSS) with an optional daily limit line. */
export function SpendChart({
  daily,
  dailyLimit,
  className,
}: {
  daily: ReadonlyArray<{ day: string; credits: number }>;
  dailyLimit?: number | null;
  className?: string;
}) {
  const peak = Math.max(0, ...daily.map((d) => d.credits));
  const max = niceMax(Math.max(peak, dailyLimit ?? 0) * 1.05);
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => f * max);
  const labelEvery = Math.max(1, Math.ceil(daily.length / 7));
  const total = daily.reduce((sum, d) => sum + d.credits, 0);

  return (
    <figure className={cn("w-full", className)}>
      <div className="flex h-56">
        <div
          aria-hidden
          className="flex w-12 flex-col justify-between pr-2 text-right text-[11px] tabular-nums text-subtle"
        >
          {ticks.map((t) => (
            <span key={t} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
              {tickLabel(t, max / 4)}
            </span>
          ))}
        </div>
        <div className="relative flex-1 border-b border-l border-border">
          {ticks.slice(0, -1).map((t) => (
            <div
              key={t}
              aria-hidden
              className="absolute inset-x-0 border-t border-dashed border-white/[0.06]"
              style={{ bottom: `${(t / max) * 100}%` }}
            />
          ))}
          {dailyLimit ? (
            <div
              aria-hidden
              className="absolute inset-x-0 z-10 border-t border-dashed border-amber-400/70"
              style={{ bottom: `${Math.min(100, (dailyLimit / max) * 100)}%` }}
            >
              <span className="absolute -top-4 right-1 text-[11px] font-medium text-amber-300">
                daily limit {credits(dailyLimit)}
              </span>
            </div>
          ) : null}
          <div aria-hidden className="absolute inset-0 flex items-end gap-[2px] px-1">
            {daily.map((d) => {
              const over = dailyLimit ? d.credits > dailyLimit : false;
              return (
                <div key={d.day} className="group relative flex h-full flex-1 items-end">
                  <div
                    className={cn(
                      "w-full rounded-t-sm transition-colors",
                      over ? "bg-rose-400/80 group-hover:bg-rose-300" : "bg-accent/60 group-hover:bg-accent",
                      d.credits > 0 && "min-h-[2px]",
                    )}
                    style={{ height: `${(d.credits / max) * 100}%` }}
                  />
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border-strong bg-surface-2 px-2 py-1 text-xs shadow-lg group-hover:block">
                    <span className="block text-subtle">{formatDay(d.day)}</span>
                    <span className="font-medium tabular-nums text-fg">{credits(d.credits)} credits</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div aria-hidden className="ml-12 mt-1.5 flex h-4 gap-[2px] px-1 text-[11px] text-subtle">
        {daily.map((d, i) => (
          <span key={d.day} className="relative min-w-0 flex-1">
            {i % labelEvery === 0 ? (
              <span className="absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap">
                {formatDay(d.day)}
              </span>
            ) : null}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">
        Daily AI credit spend over {daily.length} days, {credits(total)} credits in total.
      </figcaption>
      <table className="sr-only">
        <caption>Daily spend</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>Credits</th>
          </tr>
        </thead>
        <tbody>
          {daily.map((d) => (
            <tr key={d.day}>
              <td>{d.day}</td>
              <td>{credits(d.credits)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
