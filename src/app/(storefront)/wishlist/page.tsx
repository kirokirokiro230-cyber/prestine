import type { Metadata } from "next";
import { WishlistView } from "@/components/wishlist/wishlist-view";
import { bestSellers } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Saved items",
  description: "Pieces you have saved to come back to.",
  robots: { index: false, follow: true },
};

export default async function WishlistPage() {
  return <WishlistView recommendations={await bestSellers(4)} />;
}
