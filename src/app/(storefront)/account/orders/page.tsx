import type { Metadata } from "next";
import Link from "next/link";
import { AccountShell } from "@/components/account/account-shell";
import { OrderHistory } from "@/components/account/order-history";
import { storeSettings } from "@/lib/catalog";
import { formatReturnWindow } from "@/lib/returns";

export const metadata: Metadata = {
  title: "Orders",
  description: "Track your orders, view receipts and start a return.",
  robots: { index: false, follow: false },
};

export default async function OrdersPage() {
  const settings = await storeSettings();

  return (
    <AccountShell
      title="Orders"
      description={`Track a parcel, review what you bought, or start a return within ${formatReturnWindow(
        settings.returnWindowHours,
      )} of delivery.`}
    >
      <OrderHistory
        settings={{
          currency: settings.currency,
          locale: settings.locale,
          returnWindowHours: settings.returnWindowHours,
        }}
      />

      <section className="mt-10 border-t border-line pt-8">
        <h2 className="eyebrow mb-3">Returns and exchanges</h2>
        <p className="max-w-lg text-sm leading-relaxed text-content-muted">
          You can request a return or exchange within{" "}
          {formatReturnWindow(settings.returnWindowHours)} of delivery, subject to our{" "}
          <Link href="/return-exchange-policy" className="link-underline text-content">
            Return &amp; Exchange Policy
          </Link>
          . Once an order has been delivered, choose <em>Return items</em> on it above and
          tell us why. Refunds go back to the payment method you paid with; for cash on
          delivery we will ask for a UPI ID to send it to. To exchange an item, email{" "}
          <a href="mailto:returns@kabuda.in" className="link-underline text-content">
            returns@kabuda.in
          </a>
          .
        </p>
      </section>
    </AccountShell>
  );
}
