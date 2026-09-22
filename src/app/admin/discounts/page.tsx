import type { Metadata } from "next";
import { DiscountManager } from "@/components/admin/discount-manager";
import { StatCard } from "@/components/admin/primitives";
import { createMoneyFormatter } from "@/lib/format";
import { listPromoCodes, promoUsage } from "@/server/repositories/settings";
import { getSettings } from "@/server/repositories/settings";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Discounts" };

export default async function DiscountsPage() {
  await requirePermission("discounts:write");

  const [codes, usage, settings] = await Promise.all([
    listPromoCodes(),
    promoUsage(),
    getSettings(),
  ]);

  const money = createMoneyFormatter(settings.currency, settings.locale);

  const redemptions = Object.values(usage).reduce((sum, entry) => sum + entry.orders, 0);
  const discounted = Object.values(usage).reduce((sum, entry) => sum + entry.discounted, 0);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl leading-tight">Discounts</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-content-muted">
          Codes apply to the merchandise subtotal at checkout. A discount can be a
          percentage or a fixed amount, never both, and can require a minimum spend.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active codes" value={String(codes.length)} />
        <StatCard label="Redemptions" value={String(redemptions)} hint="All time" />
        <StatCard label="Total discounted" value={money(discounted)} />
      </div>

      <DiscountManager
        codes={codes.map((code) => ({
          code: code.code,
          description: code.description,
          percentOff: code.percentOff,
          amountOff: code.amountOff,
          minSubtotal: code.minSubtotal,
          orders: usage[code.code]?.orders ?? 0,
          discounted: usage[code.code]?.discounted ?? 0,
        }))}
        currency={settings.currency}
        locale={settings.locale}
      />
    </div>
  );
}
