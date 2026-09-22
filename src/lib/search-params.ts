import { categories as seedCategories } from "./config";
import type { Department, ProductFilters, SortKey } from "./types";

/**
 * Filter state lives in the URL, not in React state.
 *
 * That makes every filtered view shareable, bookmarkable, back-button friendly
 * and server-renderable. These helpers are the single place where query strings
 * are read and written, so the two directions can never disagree.
 */

export const PAGE_SIZE = 12;

const VALID_SORTS: SortKey[] = [
  "featured",
  "newest",
  "price-asc",
  "price-desc",
  "rating",
  "name-asc",
];

const VALID_DEPARTMENTS: Department[] = ["women", "men", "unisex"];

/** Next.js 15+ hands searchParams to pages as a promise of this shape. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  const list = Array.isArray(value) ? value : value.split(",");
  return list.map((v) => v.trim()).filter(Boolean);
}

function toNumber(value: string | string[] | undefined): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export interface ParsedQuery {
  filters: ProductFilters;
  sort: SortKey;
  page: number;
}

export interface ParseOptions {
  /**
   * Valid category slugs. Categories are editable at runtime, so the caller — which
   * has already loaded them — passes the current list rather than this module
   * relying on a compile-time union. When omitted, category values pass through
   * unvalidated.
   */
  categorySlugs?: string[];
}

/** Read a validated filter state out of the raw query object. */
export function parseSearchParams(
  params: RawSearchParams,
  options: ParseOptions = {},
): ParsedQuery {
  const categorySlugs = options.categorySlugs ?? seedCategories.map((c) => c.slug);
  const sortCandidate = Array.isArray(params.sort) ? params.sort[0] : params.sort;
  const sort = VALID_SORTS.includes(sortCandidate as SortKey)
    ? (sortCandidate as SortKey)
    : "featured";

  const page = Math.max(1, Math.floor(toNumber(params.page) ?? 1));

  const search = Array.isArray(params.q) ? params.q[0] : params.q;

  return {
    sort,
    page,
    filters: {
      // Unknown values are dropped rather than returning zero results for a typo.
      categories: toArray(params.category).filter((c) => categorySlugs.includes(c)),
      departments: toArray(params.department).filter((d): d is Department =>
        VALID_DEPARTMENTS.includes(d as Department),
      ),
      colors: toArray(params.color),
      sizes: toArray(params.size),
      minPrice: toNumber(params.minPrice),
      maxPrice: toNumber(params.maxPrice),
      onSale: params.sale === "1",
      sustainable: params.sustainable === "1",
      search: search?.trim() || undefined,
    },
  };
}

export interface QueryUpdate {
  category?: string[];
  department?: string[];
  color?: string[];
  size?: string[];
  minPrice?: number | null;
  maxPrice?: number | null;
  sale?: boolean;
  sustainable?: boolean;
  sort?: SortKey;
  page?: number;
  q?: string;
}

/**
 * Apply a partial update to an existing query string.
 *
 * Any change other than `page` resets pagination to 1 — landing on page 4 of a
 * newly filtered set that only has two pages is a classic listing bug.
 */
export function buildQueryString(
  current: URLSearchParams | Readonly<URLSearchParams>,
  update: QueryUpdate,
): string {
  const next = new URLSearchParams(current.toString());

  const setList = (key: string, values?: string[]) => {
    if (!values) return;
    next.delete(key);
    if (values.length > 0) next.set(key, values.join(","));
  };

  const setFlag = (key: string, value?: boolean) => {
    if (value === undefined) return;
    if (value) next.set(key, "1");
    else next.delete(key);
  };

  const setNumber = (key: string, value?: number | null) => {
    if (value === undefined) return;
    if (value === null) next.delete(key);
    else next.set(key, String(value));
  };

  setList("category", update.category);
  setList("department", update.department);
  setList("color", update.color);
  setList("size", update.size);
  setNumber("minPrice", update.minPrice);
  setNumber("maxPrice", update.maxPrice);
  setFlag("sale", update.sale);
  setFlag("sustainable", update.sustainable);

  if (update.sort) {
    if (update.sort === "featured") next.delete("sort");
    else next.set("sort", update.sort);
  }

  if (update.q !== undefined) {
    if (update.q.trim()) next.set("q", update.q.trim());
    else next.delete("q");
  }

  const touchedFilters = Object.keys(update).some((key) => key !== "page");
  if (update.page !== undefined) {
    if (update.page <= 1) next.delete("page");
    else next.set("page", String(update.page));
  } else if (touchedFilters) {
    next.delete("page");
  }

  const result = next.toString();
  return result ? `?${result}` : "";
}

/** Toggle one value inside a comma-separated list parameter. */
export function toggleListValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Count of filters currently applied — drives the "Filters (3)" label. */
export function countActiveFilters(filters: ProductFilters): number {
  return (
    filters.categories.length +
    filters.departments.length +
    filters.colors.length +
    filters.sizes.length +
    (filters.minPrice !== undefined || filters.maxPrice !== undefined ? 1 : 0) +
    (filters.onSale ? 1 : 0) +
    (filters.sustainable ? 1 : 0)
  );
}
