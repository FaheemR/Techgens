/** Converts a type to its JSON-serialized shape (Dates become ISO strings), for API DTOs. */
export type Jsonify<T> = T extends Date
  ? string
  : T extends bigint
    ? string
    : T extends (infer U)[]
      ? Jsonify<U>[]
      : T extends object
        ? { [K in keyof T]: Jsonify<T[K]> }
        : T;

export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "invalid" | "conflict" | "forbidden" | "budget" | "unavailable" = "invalid",
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Fills `{{key}}` placeholders; unknown keys are left untouched. */
export function fillTemplate(template: string, values: Record<string, string | number | undefined>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
