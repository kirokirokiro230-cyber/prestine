import { NextResponse } from "next/server";
import { searchProducts } from "@/lib/catalog";
import { LIMITS, consumeIpRateLimit, rateLimitMessage } from "@/server/rate-limit";

/**
 * Typeahead search endpoint.
 *
 * Exists so the search overlay does not have to ship the whole catalogue to the
 * browser. Returns a deliberately slim projection — enough to render a result
 * row and nothing more.
 */
// Dynamic because the response depends on `q`; the catalogue is in-process so
// there is no upstream latency worth caching around.
export const dynamic = "force-dynamic";

export interface SearchResultItem {
  slug: string;
  name: string;
  tagline: string;
  category: string;
  price: number;
  compareAtPrice?: number;
  colorId: string;
  colorName: string;
  colorHex: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").slice(0, 80);
  const limit = Math.min(Number(searchParams.get("limit") ?? 6) || 6, 12);

  if (query.trim().length < 2) {
    return NextResponse.json({ query, results: [] as SearchResultItem[] });
  }

  /*
   * This is a typeahead, so it fires per keystroke — hence the high allowance
   * and the short-query early return above, which keeps the cheapest calls from
   * consuming it at all.
   */
  const limited = await consumeIpRateLimit("public-read", LIMITS.publicRead);
  if (limited) {
    return NextResponse.json(
      { error: rateLimitMessage(limited) },
      { status: 429, headers: { "Retry-After": String(limited.secondsRemaining) } },
    );
  }

  const matches = await searchProducts(query, limit);

  const results: SearchResultItem[] = matches.map((product) => ({
    slug: product.slug,
    name: product.name,
    tagline: product.tagline,
    category: product.category,
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    colorId: product.colors[0].id,
    colorName: product.colors[0].name,
    colorHex: product.colors[0].hex,
  }));

  return NextResponse.json({ query, results });
}
