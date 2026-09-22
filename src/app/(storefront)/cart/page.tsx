import type { Metadata } from "next";
import { CartView } from "@/components/cart/cart-view";
import { bestSellers } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Your bag",
  description: "Review the pieces in your bag before checkout.",
  robots: { index: false, follow: false },
};

export default async function CartPage() {
  // Recommendations are resolved on the server so the empty state and the
  // cross-sell rail are both ready in the first response.
  return <CartView recommendations={await bestSellers(4)} />;
}
