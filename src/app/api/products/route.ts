import { NextResponse } from "next/server";
import { summariesByIds, summariesBySlugs } from "@/lib/catalog";
import type { ProductSummary } from "@/lib/types";
import { LIMITS, consumeIpRateLimit, rateLimitMessage } from "@/server/rate-limit";

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

  // Cheap per call, but trivially scriptable into a catalogue scrape. The
  // allowance is high enough that normal browsing never notices it.
  const limited = await consumeIpRateLimit("public-read", LIMITS.publicRead);
  if (limited) {
    return NextResponse.json(
      { error: rateLimitMessage(limited) },
      { status: 429, headers: { "Retry-After": String(limited.secondsRemaining) } },
    );
  }

  const ids = parseList(searchParams.get("ids"));
  const slugs = parseList(searchParams.get("slugs"));

  let products: ProductSummary[] = [];
  if (ids.length > 0) products = await summariesByIds(ids);
  else if (slugs.length > 0) products = await summariesBySlugs(slugs);

  return NextResponse.json({ products });
}
