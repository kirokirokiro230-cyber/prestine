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
import { site } from "@/lib/config";
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

export default async function AccountPage() {
  const customer = await currentCustomer();

  return (
    <AccountShell
      title="Overview"
      description="Everything about your orders, addresses and saved pieces in one place."
    >
      {customer ? (
        <section className="border border-line bg-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-sans text-sm font-medium">Welcome back, {customer.name}</h2>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-content-muted">
                Signed in with {customer.phone}.
              </p>
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

      <ul className="mt-6 grid gap-4 sm:grid-cols-3">
        {CARDS.map(({ href, icon: Icon, title, body }) => (
          <li key={href}>
            <Link
              href={href}
              className="group flex h-full flex-col border border-line bg-surface p-5 transition-colors hover:border-line-strong"
            >
              <Icon size={20} aria-hidden className="text-content-muted" />
              <h2 className="mt-4 font-sans text-sm font-medium">{title}</h2>
              <p className="mt-1.5 flex-1 text-xs leading-relaxed text-content-muted">
                {body}
              </p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-2xs uppercase tracking-[0.12em] text-content">
                <span className="link-underline">Open</span>
                <ArrowRight
                  size={12}
                  aria-hidden
                  className="transition-transform duration-300 group-hover:translate-x-1"
                />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="mt-10 border-t border-line pt-8">
        <h2 className="eyebrow mb-3">Need a hand?</h2>
        <p className="max-w-lg text-sm leading-relaxed text-content-muted">
          Client care is staffed by people who have handled the clothes. Email{" "}
          <a href={`mailto:${site.email}`} className="link-underline text-content">
            {site.email}
          </a>{" "}
          or call{" "}
          <a
            href={`tel:${site.phone.replace(/\s/g, "")}`}
            className="link-underline text-content"
          >
            {site.phone}
          </a>
          , weekdays 9am–6pm GMT. We answer most emails within a couple of hours.
        </p>
      </section>
    </AccountShell>
  );
}
