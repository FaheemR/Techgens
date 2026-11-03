import { credits } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A credit amount in compact contexts (cards, rows, chips): "12.5 cr", or "0.05 / 400 cr" with `of`. The short unit
 * explains itself on hover and reads as "credits" to screen readers. Prose spells out "credits" instead, and table
 * columns name the unit in their header.
 */
export function Credits({
  value,
  of,
  className,
}: {
  value: number | null | undefined;
  /** Budget or limit the amount is measured against. */
  of?: number | null | undefined;
  className?: string;
}) {
  return (
    <span className={cn("whitespace-nowrap tabular-nums", className)} title="AI credits">
      {credits(value)}
      {of ? ` / ${credits(of)}` : null} <span aria-hidden>cr</span>
      <span className="sr-only">credits</span>
    </span>
  );
}
