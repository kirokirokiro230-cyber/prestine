"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowSquareOut,
  ChartLine,
  ClipboardText,
  Envelope,
  Gear,
  List,
  Package,
  Percent,
  Receipt,
  SignOut,
  SquaresFour,
  Star,
  Storefront,
  Tag,
  UsersThree,
  X,
} from "@phosphor-icons/react";
import { Images } from "@phosphor-icons/react";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useResetOnChange } from "@/hooks/use-store";
import type { AdminRole, Permission } from "@/lib/types";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/admin/actions/auth";

/**
 * Admin chrome: persistent sidebar on desktop, slide-over on mobile.
 *
 * Navigation is filtered by the signed-in role, so a staff account never sees a
 * link it cannot use. That is presentation only — every route and action re-checks
 * the permission on the server.
 */

interface NavEntry {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** Omit to show the link to everyone signed in. */
  permission?: Permission;
  /** Count badge, e.g. orders awaiting fulfilment. */
  badge?: number;
}

interface NavSection {
  heading: string;
  entries: NavEntry[];
}

export function AdminShell({
  children,
  admin,
  pendingOrders,
}: {
  children: React.ReactNode;
  admin: { name: string; email: string; role: AdminRole };
  pendingOrders: number;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile drawer on navigation, during render so it is never briefly
  // open on the new page.
  useResetOnChange(pathname, () => setMobileOpen(false));

  const sections: NavSection[] = [
    {
      heading: "Overview",
      entries: [
        { href: "/admin", label: "Dashboard", icon: SquaresFour },
        { href: "/admin/reports", label: "Reports", icon: ChartLine },
      ],
    },
    {
      heading: "Catalogue",
      entries: [
        { href: "/admin/products", label: "Products", icon: Package, permission: "products:write" },
        { href: "/admin/banners", label: "Banners", icon: Images, permission: "products:write" },
        { href: "/admin/categories", label: "Categories", icon: Tag, permission: "products:write" },
        { href: "/admin/collections", label: "Collections", icon: Storefront, permission: "products:write" },
        { href: "/admin/reviews", label: "Reviews", icon: Star, permission: "products:write" },
      ],
    },
    {
      heading: "Selling",
      entries: [
        { href: "/admin/orders", label: "Orders", icon: Receipt, badge: pendingOrders || undefined },
        { href: "/admin/customers", label: "Customers", icon: UsersThree },
        { href: "/admin/email", label: "Email", icon: Envelope, permission: "orders:write" },
        { href: "/admin/discounts", label: "Discounts", icon: Percent, permission: "discounts:write" },
      ],
    },
    {
      heading: "Configuration",
      entries: [
        { href: "/admin/settings", label: "Settings", icon: Gear, permission: "settings:write" },
        { href: "/admin/staff", label: "Staff", icon: UsersThree, permission: "staff:write" },
        { href: "/admin/activity", label: "Activity log", icon: ClipboardText },
      ],
    },
  ];

  const allowed = (entry: NavEntry) =>
    !entry.permission || rolePermits(admin.role, entry.permission);

  const nav = (
    <nav aria-label="Admin" className="flex flex-1 flex-col gap-7 overflow-y-auto p-4 scrollbar-thin">
      {sections.map((section) => {
        const entries = section.entries.filter(allowed);
        if (entries.length === 0) return null;

        return (
          <div key={section.heading}>
            <p className="mb-2 px-2 text-2xs font-medium uppercase tracking-[0.14em] text-content-subtle">
              {section.heading}
            </p>
            <ul className="flex flex-col gap-0.5">
              {entries.map((entry) => {
                // Exact match for the dashboard, prefix match elsewhere, so
                // /admin/products/new still highlights Products.
                const active =
                  entry.href === "/admin"
                    ? pathname === "/admin"
                    : pathname === entry.href || pathname.startsWith(`${entry.href}/`);

                return (
                  <li key={entry.href}>
                    <Link
                      href={entry.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-10 items-center gap-2.5 rounded-xs px-2.5 text-sm transition-colors",
                        active
                          ? "bg-inverse text-on-inverse"
                          : "text-content-muted hover:bg-surface-sunken hover:text-content",
                      )}
                    >
                      <entry.icon size={16} className="shrink-0" />
                      <span className="flex-1 truncate">{entry.label}</span>
                      {entry.badge ? (
                        <span
                          data-numeric
                          className={cn(
                            "min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-medium leading-4",
                            active
                              ? "bg-on-inverse/20 text-on-inverse"
                              : "bg-accent text-on-accent",
                          )}
                        >
                          {entry.badge}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="border-t border-line p-4">
      <div className="mb-3 min-w-0">
        <p className="truncate text-sm font-medium">{admin.name}</p>
        <p className="truncate text-xs text-content-muted">{admin.email}</p>
        <p className="mt-1 text-2xs uppercase tracking-[0.1em] text-content-subtle">
          {admin.role}
        </p>
      </div>

      <div className="flex items-center gap-1">
        <Link
          href="/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-9 flex-1 items-center gap-2 rounded-xs px-2 text-xs text-content-muted transition-colors hover:bg-surface-sunken hover:text-content"
        >
          <ArrowSquareOut size={14} />
          View store
        </Link>

        <form action={signOut}>
          <button
            type="submit"
            className="inline-flex min-h-9 items-center gap-2 rounded-xs px-2 text-xs text-content-muted transition-colors hover:bg-surface-sunken hover:text-danger-500"
          >
            <SignOut size={14} />
            Sign out
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh bg-canvas">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="border-b border-line px-4 py-4">
          <Link
            href="/admin"
            className="font-display text-lg tracking-[0.24em] text-content transition-opacity hover:opacity-70"
          >
            <span className="-mr-[0.24em] pr-[0.24em]">PRESTINE</span>
          </Link>
          <p className="mt-1 text-2xs uppercase tracking-[0.14em] text-content-subtle">
            Admin
          </p>
        </div>
        {nav}
        {footer}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-90 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 h-full w-full animate-fade-in cursor-default bg-overlay"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 animate-slide-in-left flex-col bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-4">
              <span className="font-display text-lg tracking-[0.2em]">PRESTINE</span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="grid size-9 place-items-center text-content-muted"
              >
                <X size={18} />
              </button>
            </div>
            {nav}
            {footer}
          </div>
        </div>
      ) : null}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-50 flex items-center gap-3 border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur-md lg:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            className="-ml-2 grid size-10 place-items-center text-content lg:hidden"
          >
            <List size={20} />
          </button>

          {/* Spacer, so the theme toggle stays pinned to the right. */}
          <div className="min-w-0 flex-1" />

          <ThemeToggle />
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

/**
 * Client-side mirror of the server role table.
 *
 * Duplicated deliberately: importing the server module would pull the store into
 * the browser bundle. Presentation only — the server is authoritative.
 */
function rolePermits(role: AdminRole, permission: Permission): boolean {
  const table: Record<AdminRole, Permission[]> = {
    owner: ["products:write", "orders:write", "discounts:write", "settings:write", "staff:write"],
    manager: ["products:write", "orders:write", "discounts:write"],
    staff: ["orders:write"],
  };
  return table[role].includes(permission);
}
