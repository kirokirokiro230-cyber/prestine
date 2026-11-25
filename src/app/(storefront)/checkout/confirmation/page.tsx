import type { Metadata } from "next";
import { Suspense } from "react";
import { ConfirmationView } from "@/components/checkout/confirmation-view";
import { ConfirmationSkeleton } from "@/components/ui/skeleton";
import { bestSellers, storeSettings } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Order confirmed",
  robots: { index: false, follow: false },
};

export default async function ConfirmationPage() {
  const [recommendations, settings] = await Promise.all([bestSellers(4), storeSettings()]);

  return (
    // The order id comes from the query string, which makes this a client
    // boundary; Suspense keeps the shell streaming while it resolves. The
    // fallback matches ConfirmationView's own loading render exactly (both use
    // ConfirmationSkeleton), so this never shows two different loading treatments
    // back to back.
    <Suspense fallback={<ConfirmationSkeleton />}>
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
