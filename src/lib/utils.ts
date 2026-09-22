/**
 * Merge conditional class names.
 *
 * Deliberately dependency-free: it flattens falsy values and de-duplicates
 * whitespace, which covers every case in this codebase. It does not resolve
 * conflicting Tailwind utilities — where a component needs an override, the
 * caller's class is placed last and Tailwind's own cascade handles it.
 */
export function cn(
  ...values: Array<string | number | false | null | undefined>
): string {
  return values.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/** Clamp a number into an inclusive range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** URL-safe slug from arbitrary text. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Unique values, preserving first-seen order. */
export function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

/**
 * Decide whether a swatch or badge sitting on `hex` needs light or dark text.
 * Uses the WCAG relative-luminance formula rather than a naive average so
 * mid-tone colours resolve correctly.
 */
export function readableOn(hex: string): "light" | "dark" {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;

  const channels = [0, 2, 4].map((i) => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });

  const luminance =
    0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];

  return luminance > 0.45 ? "dark" : "light";
}

/** Deterministic 32-bit hash — used to seed generated artwork. */
export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Split an array into chunks of at most `size`. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
