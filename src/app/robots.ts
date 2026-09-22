import type { MetadataRoute } from "next";
import { storeSettings } from "@/lib/catalog";

// The public origin is merchant-managed live data; resolve it when crawlers request it.
export const dynamic = "force-dynamic";

/**
 * Robots policy.
 *
 * The host comes from settings rather than a constant, because the public origin is
 * editable in the admin panel and a stale host here would point crawlers at the
 * wrong domain.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const settings = await storeSettings();
  const base = settings.url.replace(/\/$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          // Per-session routes.
          "/cart",
          "/checkout",
          "/account",
          "/wishlist",
          // Duplicate-content and faceted URLs — excluded so crawl budget is not
          // burned on thousands of filter permutations.
          "/search",
          "/api/",
          // Back office. Already behind a login and noindex, but there is no reason
          // for a crawler to knock on the door at all.
          "/admin",
          // Only ever served while the shop is closed.
          "/maintenance",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
