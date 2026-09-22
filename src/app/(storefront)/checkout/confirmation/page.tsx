import type { Metadata } from "next";
import { Suspense } from "react";
import { ConfirmationView } from "@/components/checkout/confirmation-view";
import { bestSellers, storeSettings } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Order confirmed",
  robots: { index: false, follow: false },
};

export default async function ConfirmationPage() {
  const [recommendations, settings] = await Promise.all([bestSellers(4), storeSettings()]);

  return (
    // The order id comes from the query string, which makes this a client
    // boundary; Suspense keeps the shell streaming while it resolves.
    <Suspense
      fallback={
        <div className="page-gutter mx-auto max-w-page py-20">
          <div className="h-10 w-64 animate-shimmer bg-surface-sunken" />
          <div className="mt-8 h-80 animate-shimmer bg-surface-sunken" />
        </div>
      }
    >
      <ConfirmationView
        recommendations={recommendations}
        settings={{
          currency: settings.currency,
          locale: settings.locale,
          email: settings.email,
        }}
      />
    </Suspense>
  );
}
