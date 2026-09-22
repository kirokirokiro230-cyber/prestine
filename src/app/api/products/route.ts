import { NextResponse } from "next/server";
import { summariesByIds, summariesBySlugs } from "@/lib/catalog";
import type { ProductSummary } from "@/lib/types";

/**
 * Product summaries by id or slug.
 *
 * Exists so features whose state lives in the browser — saved items, recently
 * viewed — can resolve their stored ids without the catalogue being bundled into
 * client JavaScript. Returns the same `ProductSummary` projection server
 * components use, so a card renders identically either way.
 */
export const dynamic = "force-dynamic";

/** Cap the batch so a crafted URL cannot ask for an unbounded response. */
const MAX_ITEMS = 60;

function parseList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, MAX_ITEMS);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const ids = parseList(searchParams.get("ids"));
  const slugs = parseList(searchParams.get("slugs"));

  let products: ProductSummary[] = [];
  if (ids.length > 0) products = await summariesByIds(ids);
  else if (slugs.length > 0) products = await summariesBySlugs(slugs);

  return NextResponse.json({ products });
}
