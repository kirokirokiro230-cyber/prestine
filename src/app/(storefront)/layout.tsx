import { BrandIntro } from "@/components/brand/brand-intro";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { AnnouncementBar } from "@/components/layout/announcement-bar";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { SearchOverlay } from "@/components/layout/search-overlay";
import { ReviewPrompt } from "@/components/product/review-prompt";
import { StorefrontProviders } from "@/components/providers";
import { WishlistDrawer } from "@/components/wishlist/wishlist-drawer";
import type { PricingRules } from "@/lib/cart-math";
import { allCategories, navCollections, newArrivals, storeSettings } from "@/lib/catalog";
import { buildFooterNav, buildPrimaryNav } from "@/lib/navigation";
import { listPromoCodes } from "@/server/repositories/settings";

/**
 * Storefront chrome.
 *
 * Everything a shopper sees around the page — announcement bar, header, footer, and
 * the three global overlays — lives here rather than in the root layout, so it wraps
 * the shop and nothing else. `/admin` sits outside this group and gets none of it.
 *
 * Navigation and settings are read per render, so an edit in the admin panel shows up
 * on the next request without a deploy.
 */
export default async function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, categories, collections, arrivals, promoCodes] =
    await Promise.all([
      storeSettings(),
      allCategories(),
      navCollections(),
      newArrivals(1),
      listPromoCodes(),
    ]);

  /**
   * Pricing rules handed to the cart.
   *
   * The bag quotes totals instantly in the browser, which only stays honest if it
   * quotes from the same numbers the server charges from. Promotion codes are
   * included because the cart validates a code without a round trip — and because
   * they are public by design, there is nothing here worth withholding.
   */
  const rules: PricingRules = {
    taxRate: settings.taxRate,
    freeShippingThreshold: settings.freeShippingThreshold,
    standardShippingRate: settings.standardShippingRate,
    deliveryDaysMin: settings.deliveryDaysMin,
    deliveryDaysMax: settings.deliveryDaysMax,
    promoCodes,
    locale: settings.locale,
    currency: settings.currency,
  };

  const hero = arrivals[0];
  const nav = buildPrimaryNav(
    categories,
    collections,
    hero ? { name: hero.name, slug: hero.slug, tagline: hero.tagline } : undefined,
  );

  return (
    <StorefrontProviders rules={rules}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-100 focus:bg-inverse focus:px-4 focus:py-3 focus:text-2xs focus:uppercase focus:tracking-[0.14em] focus:text-on-inverse"
      >
        Skip to content
      </a>

      <AnnouncementBar messages={settings.announcements} />

      <Header
        nav={nav}
        storeName={settings.name}
        contact={{ email: settings.email, address: settings.address }}
      />

      <main id="main" className="min-h-[60vh]">
        {children}
      </main>

      <Footer settings={settings} columns={buildFooterNav(collections, settings)} />

      {/*
        The opening logo animation. Mounted here rather than in the root layout for
        the same reason as the rest of this chrome: `/admin` nests inside the root, and
        a splash screen over the admin panel on every login would be a bug. Rendered
        last so it is painted above the page it covers.
      */}
      <BrandIntro />

      {/* Global overlays, mounted once. */}
      <CartDrawer />
      <WishlistDrawer />
      <SearchOverlay
        categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
      />

      {/*
        The post-delivery review prompt. Decides for itself whether to open — it asks the
        server whether the signed-in shopper owes any reviews and stays shut otherwise.
      */}
      <ReviewPrompt />
    </StorefrontProviders>
  );
}
