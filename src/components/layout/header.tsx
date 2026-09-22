"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Handbag,
  Heart,
  List,
  MagnifyingGlass,
  User,
} from "@phosphor-icons/react";
import { useCart } from "@/components/providers/cart-provider";
import { useSearch } from "@/components/providers/search-provider";
import { useWishlist } from "@/components/providers/wishlist-provider";
import { useResetOnChange } from "@/hooks/use-store";
import { useScrollPosition } from "@/hooks/use-ui";
import type { NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { MegaMenu } from "./mega-menu";
import { MobileNav } from "./mobile-nav";
import { ThemeToggle } from "./theme-toggle";

/**
 * Primary site header.
 *
 * - Sticky, with a hairline border that only appears once scrolled so the top of
 *   the page stays clean.
 * - Mega menus open on hover for pointers and on focus for keyboards; Escape and
 *   blur-out both close them.
 * - Cart and saved-item counts render only after their stores hydrate, so the
 *   badge never flashes a wrong number.
 */
export function Header({
  nav,
  storeName,
  contact,
}: {
  /** Built from live categories and collections by the layout. */
  nav: NavItem[];
  storeName: string;
  contact: { email: string; address: string };
}) {
  const pathname = usePathname();
  const scrollY = useScrollPosition();

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { count: cartCount, openCart, hydrated: cartHydrated } = useCart();
  const { count: savedCount, hydrated: wishlistHydrated } = useWishlist();
  const { openSearch } = useSearch();

  // Close every overlay on navigation. Done during render rather than in an
  // effect so the menu is never briefly visible on the new route.
  useResetOnChange(pathname, () => {
    setOpenMenu(null);
    setMobileOpen(false);
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  /** Small delay closing so a diagonal pointer path to the panel does not drop it. */
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpenMenu(null), 120);
  };

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  const scrolled = scrollY > 8;

  return (
    <header
      className={cn(
        "sticky top-0 z-80 bg-canvas/92 backdrop-blur-md transition-shadow duration-300",
        scrolled && "border-b border-line shadow-xs",
      )}
      onMouseLeave={scheduleClose}
    >
      <div className="page-gutter mx-auto flex h-16 max-w-page items-center justify-between gap-4 lg:h-20">
        {/* Left: mobile trigger + desktop nav */}
        <div className="flex flex-1 items-center gap-1">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            className="-ml-2.5 grid size-11 place-items-center text-content lg:hidden"
          >
            <List size={20} aria-hidden />
          </button>

          <nav aria-label="Main" className="hidden lg:block">
            <ul className="flex items-center gap-7">
              {nav.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                const hasPanel = Boolean(item.columns);
                const panelId = `mega-${item.label.replace(/\s+/g, "-").toLowerCase()}`;
                const isOpen = openMenu === item.label;

                return (
                  <li
                    key={item.label}
                    onMouseEnter={() => {
                      cancelClose();
                      setOpenMenu(hasPanel ? item.label : null);
                    }}
                  >
                    <Link
                      href={item.href}
                      data-active={active}
                      aria-expanded={hasPanel ? isOpen : undefined}
                      aria-controls={hasPanel ? panelId : undefined}
                      onFocus={() => setOpenMenu(hasPanel ? item.label : null)}
                      className={cn(
                        "link-underline block py-2 text-2xs font-medium uppercase tracking-[0.14em] transition-colors",
                        item.label === "Sale"
                          ? "text-danger-500 dark:text-clay-300"
                          : "text-content hover:text-accent",
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        {/* Centre: brand lockup, and where the opening animation lands. */}
        <div className="flex shrink-0 justify-center lg:flex-none">
          <Logo name={storeName} flightTarget />
        </div>

        {/* Right: utilities */}
        <div className="flex flex-1 items-center justify-end gap-0.5">
          <button
            type="button"
            onClick={openSearch}
            aria-label="Search products"
            className="grid size-11 place-items-center rounded-full text-content transition-colors hover:bg-surface-sunken"
          >
            <MagnifyingGlass size={19} aria-hidden />
          </button>

          <ThemeToggle className="hidden sm:grid" />

          <Link
            href="/account"
            aria-label="Your account"
            className="hidden size-11 place-items-center rounded-full text-content transition-colors hover:bg-surface-sunken sm:grid"
          >
            <User size={19} aria-hidden />
          </Link>

          <Link
            href="/wishlist"
            aria-label={
              wishlistHydrated && savedCount > 0
                ? `Saved items, ${savedCount} saved`
                : "Saved items"
            }
            className="relative grid size-11 place-items-center rounded-full text-content transition-colors hover:bg-surface-sunken"
          >
            <Heart size={19} aria-hidden />
            {wishlistHydrated && savedCount > 0 ? (
              <span
                data-numeric
                aria-hidden
                className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-medium leading-4 text-on-accent"
              >
                {savedCount}
              </span>
            ) : null}
          </Link>

          <button
            type="button"
            onClick={openCart}
            aria-label={
              cartHydrated && cartCount > 0 ? `Your bag, ${cartCount} items` : "Your bag"
            }
            className="relative grid size-11 place-items-center rounded-full text-content transition-colors hover:bg-surface-sunken"
          >
            <Handbag size={19} aria-hidden />
            {cartHydrated && cartCount > 0 ? (
              <span
                data-numeric
                aria-hidden
                className="absolute right-0.5 top-1 grid min-w-4 place-items-center rounded-full bg-inverse px-1 text-[10px] font-medium leading-4 text-on-inverse"
              >
                {cartCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {/* Mega menus */}
      {nav
        .filter((item) => item.columns)
        .map((item) => (
          <div
            key={item.label}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          >
            <MegaMenu
              item={item}
              open={openMenu === item.label}
              onNavigate={() => setOpenMenu(null)}
              id={`mega-${item.label.replace(/\s+/g, "-").toLowerCase()}`}
            />
          </div>
        ))}

      <MobileNav
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        nav={nav}
        contact={contact}
      />
    </header>
  );
}
