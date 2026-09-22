import type { Metadata } from "next";
import { AccountShell } from "@/components/account/account-shell";
import { OrderHistory } from "@/components/account/order-history";
import { storeSettings } from "@/lib/catalog";

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
      description="Track a parcel, review what you bought, or start a return within the first 30 days."
    >
      <OrderHistory
        settings={{ currency: settings.currency, locale: settings.locale }}
      />

      <section className="mt-10 border-t border-line pt-8">
        <h2 className="eyebrow mb-3">Returns and exchanges</h2>
        <p className="max-w-lg text-sm leading-relaxed text-content-muted">
          Returns are free for {settings.returnWindowDays} days from delivery. Reply to
          your confirmation email or contact client care with your order reference and we
          will book a collection from your door — usually the next working day. Archive
          sale pieces are final sale.
        </p>
      </section>
    </AccountShell>
  );
}
