import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Heart,
  MapPin,
  Package,
  SignIn,
  SignOut,
} from "@phosphor-icons/react/dist/ssr";
import { signOut } from "@/app/actions/customer-auth";
import { AccountShell } from "@/components/account/account-shell";
import { Button, ButtonLink } from "@/components/ui/button";

import { currentCustomer } from "@/server/customer-session";

export const metadata: Metadata = {
  title: "Account",
  description: "Manage your orders, addresses and saved items.",
  robots: { index: false, follow: false },
};

const CARDS = [
  {
    href: "/account/orders",
    icon: Package,
    title: "Orders",
    body: "Track a parcel, download a receipt or start a return.",
  },
  {
    href: "/account/addresses",
    icon: MapPin,
    title: "Addresses",
    body: "Manage delivery and billing addresses.",
  },
  {
    href: "/wishlist",
    icon: Heart,
    title: "Saved items",
    body: "Pieces you have set aside while you decide.",
  },
];

/**
 * Up to two initials from a name.
 *
 * First and last word rather than the first two, so "Aliasgar Hussain Agharia"
 * reads AA like the person would write it. Falls back to a single letter for a
 * one-word name, and to nothing at all rather than rendering a stray character
 * for an empty one.
 */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export default async function AccountPage() {
  const customer = await currentCustomer();

  return (
    <AccountShell
      title="Overview"
      description="Everything about your orders, addresses and saved pieces in one place."
    >
      {customer ? (
        <section className="border border-line bg-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div className="flex min-w-0 items-center gap-4">
              {/*
                Initials rather than an avatar upload. There is no profile photo
                in this build, and a generic silhouette icon says nothing — two
                letters at least belong to the person looking at them.
              */}
              <span
                aria-hidden
                className="grid size-12 shrink-0 place-items-center rounded-full bg-inverse font-sans text-sm font-medium text-on-inverse"
              >
                {initials(customer.name)}
              </span>

              <div className="min-w-0">
                <h2 className="truncate font-sans text-base font-medium">
                  {customer.name}
                </h2>
                <p data-numeric className="mt-0.5 text-sm text-content-muted">
                  {customer.phone}
                </p>
              </div>
            </div>

            <form action={signOut}>
              <Button type="submit" variant="outline" size="sm">
                <SignOut size={14} aria-hidden />
                Sign out
              </Button>
            </form>
          </div>
        </section>
      ) : (
        <section className="border border-line bg-surface p-6">
          <div className="flex items-start gap-4">
            <SignIn size={20} aria-hidden className="mt-0.5 shrink-0 text-content-muted" />
            <div>
              <h2 className="font-sans text-sm font-medium">You are browsing as a guest</h2>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-content-muted">
                Orders placed in this browser are saved locally so you can track them.
                Sign in to sync them across devices, save addresses and check out faster.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <ButtonLink href="/signin" size="md">
                  Sign in
                </ButtonLink>
                <ButtonLink href="/signup" variant="outline" size="md">
                  Create an account
                </ButtonLink>
              </div>
            </div>
          </div>
        </section>
      )}

      <ul className="mt-4 grid gap-4 sm:grid-cols-3">
        {CARDS.map(({ href, icon: Icon, title, body }) => (
          <li key={href}>
            {/*
              The whole card is the link, and the arrow moves on hovering any
              part of it — a small "Open" affordance that only responded to its
              own four words made the rest of the card feel inert.
            */}
            <Link
              href={href}
              className="group flex h-full flex-col border border-line bg-surface p-5 transition-colors hover:border-line-strong hover:bg-surface-sunken"
            >
              <span className="flex items-center justify-between">
                <Icon size={20} aria-hidden className="text-content-muted" />
                <ArrowRight
                  size={14}
                  aria-hidden
                  className="text-content-subtle transition-transform duration-300 group-hover:translate-x-1 group-hover:text-content"
                />
              </span>
              <h2 className="mt-4 font-sans text-sm font-medium">{title}</h2>
              <p className="mt-1.5 flex-1 text-xs leading-relaxed text-content-muted">
                {body}
              </p>
            </Link>
          </li>
        ))}
      </ul>

      <section className="mt-10 border-t border-line pt-8">
        <h2 className="eyebrow mb-3">Need a hand?</h2>
        <p className="max-w-lg text-sm leading-relaxed text-content-muted">
          For help with an order, contact our customer support team on the{" "}
          <Link href="/contact" className="link-underline text-content">
            Contact Us
          </Link>{" "}
          page, and keep your order number ready.
        </p>
      </section>
    </AccountShell>
  );
}
