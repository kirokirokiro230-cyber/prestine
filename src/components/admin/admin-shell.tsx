"use client";

import { useState, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowSquareOut,
  Camera,
  ChartLine,
  ClipboardText,
  Envelope,
  Gear,
  Images,
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
} from "@phosphor-icons/react";
import { signOut } from "@/app/admin/actions/auth";
import { AdminNotifications } from "@/components/admin/notifications";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Drawer } from "@/components/ui/drawer";
import { useResetOnChange } from "@/hooks/use-store";
import type { AdminRole, Permission } from "@/lib/types";
import { cn } from "@/lib/utils";

interface NavEntry {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  permission?: Permission;
  badge?: number;
}

interface NavSection {
  heading: string;
  entries: NavEntry[];
}

/** Professional operational shell with role-aware desktop and mobile navigation. */
export function AdminShell({
  children,
  admin,
  pendingOrders,
}: {
  children: ReactNode;
  admin: { name: string; email: string; role: AdminRole };
  pendingOrders: number;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

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
        { href: "/admin/styling", label: "Style hints", icon: Camera, permission: "products:write" },
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

  const isActive = (entry: NavEntry) =>
    entry.href === "/admin"
      ? pathname === "/admin"
      : pathname === entry.href || pathname.startsWith(`${entry.href}/`);

  const currentEntry = sections
    .flatMap((section) => section.entries)
    .filter(allowed)
    .find(isActive);

  const nav = (
    <nav aria-label="Admin" className="flex flex-col gap-6 px-3 py-4 scrollbar-thin">
      {sections.map((section) => {
        const entries = section.entries.filter(allowed);
        if (entries.length === 0) return null;

        return (
          <div key={section.heading}>
            <p className="mb-2 px-3 text-[0.625rem] font-bold uppercase tracking-[0.16em] text-content-subtle">
              {section.heading}
            </p>
            <ul className="flex flex-col gap-1">
              {entries.map((entry) => {
                const active = isActive(entry);
                return (
                  <li key={entry.href}>
                    <Link
                      href={entry.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-[background-color,color,box-shadow]",
                        active
                          ? "bg-accent-soft text-accent shadow-xs"
                          : "text-content-muted hover:bg-surface-sunken hover:text-content",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-7 shrink-0 place-items-center rounded-lg transition-colors",
                          active ? "bg-accent text-on-accent" : "bg-surface-sunken group-hover:bg-surface",
                        )}
                      >
                        <entry.icon size={15} aria-hidden />
                      </span>
                      <span className="flex-1 truncate">{entry.label}</span>
                      {entry.badge ? (
                        <span
                          data-numeric
                          className="min-w-5 rounded-full bg-accent px-1.5 py-0.5 text-center text-[10px] font-bold leading-4 text-on-accent"
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
    <>
      <div className="mb-3 flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold uppercase text-accent">
          {initials(admin.name)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-content">{admin.name}</p>
          <p className="truncate text-xs text-content-muted">{admin.email}</p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Link
          href="/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-9 flex-1 items-center gap-2 rounded-lg px-2 text-xs font-medium text-content-muted transition-colors hover:bg-surface-sunken hover:text-content"
        >
          <ArrowSquareOut size={14} aria-hidden />
          View store
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-xs font-medium text-content-muted transition-colors hover:bg-surface-sunken hover:text-danger-500"
          >
            <SignOut size={14} aria-hidden />
            Sign out
          </button>
        </form>
      </div>
    </>
  );

  return (
    <div className="admin-theme flex min-h-dvh bg-canvas text-content">
      <a
        href="#admin-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-100 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-3 focus:text-xs focus:font-semibold focus:text-on-accent"
      >
        Skip to admin content
      </a>

      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-17 items-center border-b border-line px-5">
          <Link href="/admin" className="group flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-accent text-sm font-bold text-on-accent shadow-sm">
              P
            </span>
            <span>
              <span className="block text-sm font-bold tracking-[0.16em] text-content">PRESTINE</span>
              <span className="mt-0.5 block text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-content-subtle">
                Commerce admin
              </span>
            </span>
          </Link>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>
        <div className="border-t border-line bg-surface px-4 py-4">{footer}</div>
      </aside>

      <Drawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        side="left"
        title="PRESTINE admin"
        description="Commerce workspace"
        widthClass="w-[19rem] max-w-[88vw]"
        panelClassName="admin-theme"
        footer={footer}
      >
        {nav}
      </Drawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-50 flex h-17 items-center gap-3 border-b border-line bg-surface/92 px-4 shadow-xs backdrop-blur-xl sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open admin menu"
            aria-expanded={mobileOpen}
            className="-ml-2 grid size-10 place-items-center rounded-lg text-content transition-colors hover:bg-surface-sunken lg:hidden"
          >
            <List size={20} aria-hidden />
          </button>

          <div className="min-w-0 flex-1">
            <p className="text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-content-subtle">
              Workspace
            </p>
            <p className="truncate text-sm font-semibold text-content">
              {currentEntry?.label ?? "Admin"}
            </p>
          </div>

          <Link
            href="/"
            target="_blank"
            rel="noreferrer"
            aria-label="View storefront in a new tab"
            className="hidden size-10 place-items-center rounded-full text-content-muted transition-colors hover:bg-surface-sunken hover:text-content sm:grid"
          >
            <ArrowSquareOut size={17} aria-hidden />
          </Link>
          <AdminNotifications />
          <ThemeToggle />
          <span
            aria-label={`Signed in as ${admin.name}, ${admin.role}`}
            title={`${admin.name} · ${admin.role}`}
            className="hidden size-9 place-items-center rounded-full bg-accent text-xs font-bold uppercase text-on-accent sm:grid"
          >
            {initials(admin.name)}
          </span>
        </header>

        <main id="admin-content" className="admin-main min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[96rem]">{children}</div>
        </main>
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

function rolePermits(role: AdminRole, permission: Permission): boolean {
  const table: Record<AdminRole, Permission[]> = {
    owner: ["products:write", "orders:write", "discounts:write", "settings:write", "staff:write"],
    manager: ["products:write", "orders:write", "discounts:write"],
    staff: ["orders:write"],
  };
  return table[role].includes(permission);
}
