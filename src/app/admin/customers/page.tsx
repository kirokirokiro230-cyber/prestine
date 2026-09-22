import type { Metadata } from "next";
import Link from "next/link";
import { Panel, StatCard } from "@/components/admin/primitives";
import { createMoneyFormatter, formatDate } from "@/lib/format";
import { listCustomers } from "@/server/repositories/orders";
import { getSettings } from "@/server/repositories/settings";
import { requireAdmin } from "@/server/session";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();

  const [{ q }, customers, settings] = await Promise.all([
    searchParams,
    listCustomers(),
    getSettings(),
  ]);

  const money = createMoneyFormatter(settings.currency, settings.locale);

  const needle = q?.trim().toLowerCase();
  const rows = needle
    ? customers.filter((customer) =>
        `${customer.name} ${customer.email} ${customer.city}`.toLowerCase().includes(needle),
      )
    : customers;

  const lifetime = customers.reduce((sum, customer) => sum + customer.totalSpent, 0);
  const repeat = customers.filter((customer) => customer.orderCount > 1).length;
  const repeatRate =
    customers.length === 0 ? 0 : Math.round((repeat / customers.length) * 100);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl leading-tight">Customers</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-content-muted">
          Derived from order history — guests can check out, so orders are the record.
          Grouped by email address where one was captured.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Customers" value={String(customers.length)} />
        <StatCard label="Repeat buyers" value={String(repeat)} hint={`${repeatRate}% of all`} />
        <StatCard label="Lifetime revenue" value={money(lifetime)} />
        <StatCard
          label="Average lifetime value"
          value={money(customers.length === 0 ? 0 : Math.round(lifetime / customers.length))}
        />
      </div>

      <Panel title="All customers" description="Ranked by lifetime spend." bodyClassName="px-0 py-0">
        <form className="border-b border-line px-5 py-4">
          <label htmlFor="customer-search" className="sr-only">
            Search customers
          </label>
          <input
            id="customer-search"
            name="q"
            type="search"
            defaultValue={q ?? ""}
            placeholder="Name, email or city"
            className="h-10 w-full max-w-sm border border-line-strong bg-canvas px-3 text-sm placeholder:text-content-subtle focus:border-accent focus:outline-none"
          />
        </form>

        {rows.length === 0 ? (
          <p className="px-5 py-16 text-center text-sm text-content-muted">
            {customers.length === 0
              ? "No orders yet, so no customers to show."
              : "No customers match that search."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-3xl text-sm">
              <caption className="sr-only">Customers by lifetime spend</caption>
              <thead>
                <tr className="border-b border-line text-left">
                  {["Customer", "Location", "Orders", "Lifetime", "Average", "Last order"].map(
                    (heading) => (
                      <th
                        key={heading}
                        scope="col"
                        className={
                          ["Orders", "Lifetime", "Average"].includes(heading)
                            ? "px-3 py-2.5 text-right text-2xs font-medium uppercase tracking-[0.1em] text-content-muted"
                            : "px-3 py-2.5 text-2xs font-medium uppercase tracking-[0.1em] text-content-muted"
                        }
                      >
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>

              <tbody>
                {rows.map((customer) => (
                  <tr key={customer.key} className="border-b border-line last:border-0">
                    <td className="px-3 py-3 pl-5">
                      {/*
                        The key is an email or `name|phone`, so it must be encoded
                        before it goes in a path segment — an unescaped `@` or `|`
                        produces a URL that some proxies reject outright.
                      */}
                      <Link
                        href={`/admin/customers/${encodeURIComponent(customer.key)}`}
                        className="block font-medium hover:text-accent"
                      >
                        {customer.name}
                      </Link>
                      <span className="block truncate text-xs text-content-subtle">
                        {customer.email}
                      </span>
                    </td>

                    <td className="px-3 py-3 text-content-muted">
                      {customer.city}
                      <span className="block text-xs text-content-subtle">
                        {customer.country}
                      </span>
                    </td>

                    <td data-numeric className="px-3 py-3 text-right">
                      {customer.orderCount}
                    </td>

                    <td data-numeric className="px-3 py-3 text-right font-medium">
                      {money(customer.totalSpent)}
                    </td>

                    <td data-numeric className="px-3 py-3 text-right text-content-muted">
                      {money(customer.averageOrderValue)}
                    </td>

                    <td className="px-3 py-3 pr-5">
                      <Link
                        href={`/admin/orders/${customer.orderIds[0]}`}
                        className="link-underline text-content-muted"
                      >
                        {formatDate(customer.lastOrderAt, "short")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <p className="text-xs leading-relaxed text-content-subtle">
        Customer records are a projection, not a table — there is nothing to edit here.
        Once accounts are wired up, this screen becomes the place to look up a signed-in
        customer and their saved addresses.
      </p>
    </div>
  );
}
