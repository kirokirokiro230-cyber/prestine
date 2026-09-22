"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { accountNav } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * Shared chrome for the account section: breadcrumbs, heading and a side nav that
 * marks the current page with `aria-current`.
 */
export function AccountShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="page-gutter mx-auto max-w-page py-8 lg:py-12">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Account", href: "/account" },
          ...(pathname === "/account" ? [] : [{ label: title }]),
        ]}
        className="mb-6"
      />

      <header className="max-w-2xl">
        <p className="eyebrow mb-3">Your account</p>
        <h1 className="text-4xl leading-tight sm:text-5xl">{title}</h1>
        {description ? (
          <p className="mt-4 text-sm leading-relaxed text-content-muted">{description}</p>
        ) : null}
      </header>

      <div className="mt-10 grid min-w-0 gap-10 lg:grid-cols-[14rem_1fr] lg:gap-16">
        <nav aria-label="Account" className="min-w-0 lg:sticky lg:top-28 lg:self-start">
          <ul className="flex min-w-0 gap-1 overflow-x-auto border-b border-line pb-2 lg:flex-col lg:gap-0 lg:border-0 lg:pb-0">
            {accountNav.map((link) => {
              const active = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 shrink-0 items-center whitespace-nowrap px-3 text-sm transition-colors lg:border-l-2 lg:px-4",
                      active
                        ? "text-content lg:border-inverse lg:bg-surface-sunken"
                        : "text-content-muted hover:text-content lg:border-transparent",
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
