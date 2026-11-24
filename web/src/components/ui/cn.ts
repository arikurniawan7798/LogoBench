/** Joins class names, skipping falsy values. Components avoid conflicting utilities instead of merging them. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
